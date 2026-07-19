import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import {
  buildExportArgs,
  getExportDuration,
  getExportPreset,
  type ExportClip,
  type ExportPresetId,
  type ExportSettings,
} from '@videodip/media-engine';
import { appError, err, ok, type AssetId, type Result } from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';
import type { AspectRatio } from '../editor.store';
import { PROJECT_FPS } from './composition-adapter';

/** Short edge of every export, the standard short-form delivery size. */
const SHORT_EDGE = 1080;
const EXPORT_TIMEOUT_MS = 30 * 60 * 1_000;

/**
 * Output pixel dimensions for an aspect ratio, from the "1080 short edge"
 * rule — the same rule the preview player sizes its composition by. Derived
 * rather than duplicated as a lookup table so the two can't drift apart one
 * ratio at a time. Dimensions are rounded to even, which H.264 4:2:0
 * requires.
 */
export function exportFrameSize(aspectRatio: AspectRatio): {
  readonly width: number;
  readonly height: number;
} {
  const [w = 1, h = 1] = aspectRatio.split(':').map(Number);
  const even = (value: number) => Math.round(value / 2) * 2;
  return w <= h
    ? { width: SHORT_EDGE, height: even((SHORT_EDGE * h) / w) }
    : { width: even((SHORT_EDGE * w) / h), height: SHORT_EDGE };
}

type ResolvedExportSettings = Omit<ExportSettings, 'outputPath'>;

/** Combines the selected project geometry with an optional encoding-quality profile. */
export function resolveExportSettings(
  aspectRatio: AspectRatio,
  presetId?: ExportPresetId,
): Result<ResolvedExportSettings> {
  const requestedPreset = presetId ? getExportPreset(presetId) : null;
  if (requestedPreset && !requestedPreset.ok) return requestedPreset;

  const encoding = requestedPreset?.value;
  return ok({
    ...exportFrameSize(aspectRatio),
    fps: encoding?.fps ?? PROJECT_FPS,
    ...(encoding
      ? {
          crf: encoding.crf,
          encoderPreset: encoding.encoderPreset,
          audioBitrate: encoding.audioBitrate,
        }
      : {}),
  });
}

/**
 * Flattens the document's video track into the ordered clip list export
 * renders, resolving asset ids to absolute paths.
 *
 * A clip whose asset is missing from the media pool is an error, not a skip:
 * the preview may quietly drop an unresolvable clip, but an export that
 * silently omits content the user can see on their timeline would be a lie
 * written to disk.
 */
export function toExportClips(
  document: TimelineDocument,
  resolvePath: (assetId: AssetId) => string | undefined,
): Result<readonly ExportClip[]> {
  const videoTrack = document.tracks.find((track) => track.kind === 'video');
  const clips = [...(videoTrack?.isVisible === false ? [] : (videoTrack?.clips ?? []))]
    .filter((clip) => clip.isEnabled)
    .sort((a, b) => a.start - b.start);

  const exportClips: ExportClip[] = [];
  for (const [index, clip] of clips.entries()) {
    const src = resolvePath(clip.assetId);
    if (src === undefined) {
      return err(
        appError(
          'NOT_FOUND',
          `A timeline clip references missing media (asset ${clip.assetId}).`,
          'Remove the clip whose media file is gone, or re-import the file, then export again.',
        ),
      );
    }
    exportClips.push({
      src,
      sourceStart: clip.sourceStart,
      duration: clip.duration,
      transform: clip.transform,
      opacity: clip.opacity,
      blendMode: clip.blendMode,
      animation: clip.animation,
      audio: { ...clip.audio, isMuted: videoTrack?.isMuted === true || clip.audio.isMuted },
      transitionToNext: (() => {
        const next = clips[index + 1];
        const transition = next
          ? document.transitions.find(
              (candidate) => candidate.fromClipId === clip.id && candidate.toClipId === next.id,
            )
          : undefined;
        return transition ? { kind: transition.kind, duration: transition.duration } : null;
      })(),
    });
  }
  return ok(exportClips);
}

/** Payload of the Rust side's `export-progress` events. */
interface ExportProgressEvent {
  readonly taskId: string;
  readonly fraction: number;
}

/**
 * Runs a full export: save dialog → FFmpeg via the Rust `export_video`
 * command → encoded MP4 on disk.
 *
 * Resolves to the output path, or `null` when the user cancelled the save
 * dialog — a real outcome, not an error. `onProgress` receives 0..1 fractions
 * of real encode progress (constitution: a knowable percentage, never just a
 * spinner). Requires the Tauri shell; in a plain browser tab it fails with a
 * recoverable `UNSUPPORTED` before touching any dialog.
 */
export async function exportTimeline(
  document: TimelineDocument,
  resolvePath: (assetId: AssetId) => string | undefined,
  aspectRatio: AspectRatio,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  presetId?: ExportPresetId,
): Promise<Result<string | null>> {
  if (!isTauri()) {
    return err(
      appError(
        'UNSUPPORTED',
        'Export needs the desktop shell.',
        'Run the desktop app (`pnpm tauri dev`) — the browser preview cannot spawn FFmpeg.',
      ),
    );
  }

  const clips = toExportClips(document, resolvePath);
  if (!clips.ok) return clips;

  // Validate the timeline before showing any dialog: asking the user to pick
  // a destination for an export that can never start is a small betrayal.
  const exportSettings = resolveExportSettings(aspectRatio, presetId);
  if (!exportSettings.ok) return exportSettings;
  const probeArgs = buildExportArgs(clips.value, {
    ...exportSettings.value,
    outputPath: 'probe.mp4',
  });
  if (!probeArgs.ok) return probeArgs;

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

  const args = buildExportArgs(clips.value, {
    ...exportSettings.value,
    outputPath,
  });
  if (!args.ok) return args;

  const taskId = crypto.randomUUID();
  const operation = createExportSignal(signal);
  const cancel = () => {
    void invoke('cancel_export', { taskId }).catch(() => undefined);
  };
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<ExportProgressEvent>('export-progress', (event) => {
      if (event.payload.taskId !== taskId || !Number.isFinite(event.payload.fraction)) return;
      onProgress(Math.max(0, Math.min(1, event.payload.fraction)));
    });
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(exportTimeoutError()) : ok(null);
    }
    operation.signal.addEventListener('abort', cancel, { once: true });
    await invoke('export_video', {
      taskId,
      args: args.value,
      totalDurationMs: getExportDuration(clips.value),
    });
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(exportTimeoutError()) : ok(null);
    }
    return ok(outputPath);
  } catch (cause) {
    if (operation.signal.aborted) {
      return operation.didTimeOut() ? err(exportTimeoutError()) : ok(null);
    }
    // The Rust side's error strings are written for the user and carry their
    // own recovery hints (missing FFmpeg, encoder failure tail), so they land
    // in `recovery` — the field the UI actually shows.
    return err(appError('IO', 'FFmpeg export failed.', String(cause), { cause }));
  } finally {
    operation.signal.removeEventListener('abort', cancel);
    operation.cleanup();
    unlisten?.();
  }
}

function createExportSignal(external: AbortSignal | undefined) {
  const controller = new AbortController();
  let didTimeOut = false;
  const abortFromExternal = () => controller.abort(external?.reason);
  if (external?.aborted) abortFromExternal();
  else external?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => {
    didTimeOut = true;
    controller.abort('timeout');
  }, EXPORT_TIMEOUT_MS);
  return {
    signal: controller.signal,
    didTimeOut: () => didTimeOut,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener('abort', abortFromExternal);
    },
  };
}

function exportTimeoutError() {
  return appError(
    'CANCELLED',
    'FFmpeg export exceeded the local time limit.',
    'Retry with a shorter timeline or a faster export preset.',
    { retryable: true, context: { reason: 'timeout' } },
  );
}
