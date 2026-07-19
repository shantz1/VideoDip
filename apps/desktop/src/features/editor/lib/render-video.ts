import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { getExportPreset, type ExportPresetId } from '@videodip/media-engine';
import {
  appError,
  err,
  fps,
  msToFrames,
  ok,
  type AssetId,
  type MediaKind,
  type Result,
} from '@videodip/shared';
import type { VideoDipCompositionProps } from '@videodip/renderer';
import type { SubtitleDocument } from '@videodip/subtitle-engine';
import { getDuration, type TimelineDocument } from '@videodip/timeline';
import type { AspectRatio } from '../editor.store';
import { PROJECT_FPS, toCompositionClips, toCompositionSubtitles } from './composition-adapter';
import { exportFrameSize } from './export-video';

/**
 * Composited renders draw every frame through headless Chromium, so they run
 * far slower than FFmpeg's stream copy — the ceiling is correspondingly
 * higher than the cuts-only export's 30 minutes.
 */
const RENDER_TIMEOUT_MS = 60 * 60 * 1_000;

/**
 * Availability of the ADR-0011 Node render sidecar on this machine, as
 * reported by the Rust host's `get_render_status` command.
 *
 * The export UI reads this before offering the composited engine, so the
 * choice between "full render" and "fast cut" stays explicit and the FFmpeg
 * path remains selectable — never silently replaced.
 */
export interface RenderEngineStatus {
  readonly isAvailable: boolean;
  readonly nodePath: string | null;
  readonly cliPath: string | null;
  /** User-facing reason the engine is unavailable, with a recovery path. */
  readonly reason: string | null;
}

/**
 * Reports whether the composited render engine can run here. Never rejects:
 * in a plain browser tab, or if the probe itself fails, the engine is simply
 * unavailable with a reason — offline-first means a failed probe degrades to
 * the FFmpeg path, not to an error dialog.
 */
export async function getRenderEngineStatus(): Promise<RenderEngineStatus> {
  if (!isTauri()) {
    return {
      isAvailable: false,
      nodePath: null,
      cliPath: null,
      reason: 'Composited rendering needs the desktop shell.',
    };
  }
  try {
    return await invoke<RenderEngineStatus>('get_render_status');
  } catch (cause) {
    return {
      isAvailable: false,
      nodePath: null,
      cliPath: null,
      reason: `The render runtime probe failed: ${String(cause)}. Restart VideoDip and try again.`,
    };
  }
}

/** The asset resolution a composited render job needs: a plain absolute path plus the media kind. */
export interface RenderableAsset {
  readonly path: string;
  readonly mediaKind: MediaKind;
}

/**
 * Builds the composition props a headless render job carries — the very
 * same `VideoDipCompositionProps` contract the live preview mounts, which is
 * what makes the export WYSIWYG (ADR-0011).
 *
 * Sources are plain absolute paths, not `convertFileSrc` URLs: frames are
 * extracted server-side by `@remotion/renderer`, which reads the files
 * directly from disk. An enabled clip whose asset is missing is an error,
 * not a skip — identical policy to the FFmpeg path, and for the same reason:
 * an export that silently omits visible content is a lie written to disk.
 */
export function buildRenderProps(
  document: TimelineDocument,
  subtitles: SubtitleDocument,
  resolveAsset: (assetId: AssetId) => RenderableAsset | undefined,
  aspectRatio: AspectRatio,
  presetId?: ExportPresetId,
): Result<VideoDipCompositionProps> {
  const requestedPreset = presetId ? getExportPreset(presetId) : null;
  if (requestedPreset && !requestedPreset.ok) return requestedPreset;

  for (const track of document.tracks) {
    if (!track.isVisible) continue;
    for (const clip of track.clips) {
      if (clip.isEnabled && resolveAsset(clip.assetId) === undefined) {
        return err(
          appError(
            'NOT_FOUND',
            `A timeline clip references missing media (asset ${clip.assetId}).`,
            'Remove the clip whose media file is gone, or re-import the file, then export again.',
          ),
        );
      }
    }
  }

  // Every ms→frame conversion below must share this one rate: a 60 fps
  // preset with clip offsets still computed at 30 fps would play everything
  // at double speed.
  const frameRate = requestedPreset ? fps(requestedPreset.value.fps) : PROJECT_FPS;

  const clips = toCompositionClips(
    document,
    (assetId) => {
      const asset = resolveAsset(assetId);
      return asset === undefined ? undefined : { src: asset.path, mediaKind: asset.mediaKind };
    },
    frameRate,
  );

  // Match the preview's duration rule exactly: the render runs as long as
  // either the timeline or the last subtitle cue, whichever ends later.
  const subtitleEnd = subtitles.segments.at(-1)?.end ?? 0;
  const durationMs = Math.max(getDuration(document), subtitleEnd);
  const durationInFrames = Math.max(1, msToFrames(durationMs as never, frameRate));

  return ok({
    clips,
    subtitles:
      document.tracks.find((track) => track.kind === 'subtitle')?.isVisible === false
        ? []
        : toCompositionSubtitles(subtitles, frameRate),
    settings: {
      ...exportFrameSize(aspectRatio),
      fps: frameRate,
      durationInFrames,
    },
  });
}

/** Payload of the Rust side's `render-progress` events. */
interface RenderProgressEvent {
  readonly taskId: string;
  readonly fraction: number;
}

/**
 * Runs a full composited export: save dialog → Node render sidecar via the
 * Rust `render_video` command → encoded MP4 on disk.
 *
 * Resolves to the output path, or `null` when the user cancelled the save
 * dialog. `onProgress` receives 0..1 fractions covering bundling and frame
 * rendering combined. Requires the desktop shell; in a browser tab it fails
 * with a recoverable `UNSUPPORTED` before touching any dialog.
 */
export async function renderTimelineComposited(
  document: TimelineDocument,
  subtitles: SubtitleDocument,
  resolveAsset: (assetId: AssetId) => RenderableAsset | undefined,
  aspectRatio: AspectRatio,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  presetId?: ExportPresetId,
): Promise<Result<string | null>> {
  if (!isTauri()) {
    return err(
      appError(
        'UNSUPPORTED',
        'Composited export needs the desktop shell.',
        'Run the desktop app (`pnpm tauri dev`) — the browser preview cannot spawn the render runtime.',
      ),
    );
  }

  const props = buildRenderProps(document, subtitles, resolveAsset, aspectRatio, presetId);
  if (!props.ok) return props;

  let outputPath: string | null;
  try {
    outputPath = await save({
      title: 'Export video',
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    });
  } catch (cause) {
    return err(appError('IO', 'The save dialog failed.', 'Try exporting again.', { cause }));
  }
  if (outputPath === null) return ok(null);
  if (signal?.aborted) return ok(null);

  const taskId = crypto.randomUUID();
  const operation = createRenderSignal(signal);
  const cancel = () => {
    void invoke('cancel_render', { taskId }).catch(() => undefined);
  };
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<RenderProgressEvent>('render-progress', (event) => {
      if (event.payload.taskId !== taskId || !Number.isFinite(event.payload.fraction)) return;
      onProgress(Math.max(0, Math.min(1, event.payload.fraction)));
    });
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(renderTimeoutError()) : ok(null);
    }
    operation.signal.addEventListener('abort', cancel, { once: true });
    await invoke('render_video', {
      taskId,
      jobJson: JSON.stringify({ props: props.value, outputPath }),
    });
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(renderTimeoutError()) : ok(null);
    }
    return ok(outputPath);
  } catch (cause) {
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(renderTimeoutError()) : ok(null);
    }
    // The Rust side's error strings are written for the user and carry their
    // own recovery hints (unprovisioned runtime, renderer failure tail), so
    // they land in `recovery` — the field the UI actually shows.
    return err(appError('IO', 'Composited render failed.', String(cause), { cause }));
  } finally {
    operation.signal.removeEventListener('abort', cancel);
    operation.cleanup();
    unlisten?.();
  }
}

function createRenderSignal(external: AbortSignal | undefined) {
  const controller = new AbortController();
  let didTimeOut = false;
  const abortFromExternal = () => controller.abort(external?.reason);
  if (external?.aborted) abortFromExternal();
  else external?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => {
    didTimeOut = true;
    controller.abort('timeout');
  }, RENDER_TIMEOUT_MS);
  return {
    signal: controller.signal,
    didTimeOut: () => didTimeOut,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener('abort', abortFromExternal);
    },
  };
}

function renderTimeoutError() {
  return appError(
    'CANCELLED',
    'The composited render exceeded the local time limit.',
    'Retry with a shorter timeline, or use the fast cut-only export.',
    { retryable: true, context: { reason: 'timeout' } },
  );
}
