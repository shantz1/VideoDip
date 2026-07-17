import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { buildExportArgs, getExportDuration, type ExportClip } from '@videodip/media-engine';
import { appError, err, ok, type AssetId, type Result } from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';
import type { AspectRatio } from '../editor.store';
import { PROJECT_FPS } from './composition-adapter';

/** Short edge of every export, the standard short-form delivery size. */
const SHORT_EDGE = 1080;

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
  const clips = [...(videoTrack?.clips ?? [])].sort((a, b) => a.start - b.start);

  const exportClips: ExportClip[] = [];
  for (const clip of clips) {
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
    exportClips.push({ src, sourceStart: clip.sourceStart, duration: clip.duration });
  }
  return ok(exportClips);
}

/** Payload of the Rust side's `export-progress` events. */
interface ExportProgressEvent {
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
  const { width, height } = exportFrameSize(aspectRatio);
  const probeArgs = buildExportArgs(clips.value, {
    width,
    height,
    fps: PROJECT_FPS,
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

  const args = buildExportArgs(clips.value, {
    width,
    height,
    fps: PROJECT_FPS,
    outputPath,
  });
  if (!args.ok) return args;

  const unlisten = await listen<ExportProgressEvent>('export-progress', (event) => {
    onProgress(event.payload.fraction);
  });
  try {
    await invoke('export_video', {
      args: args.value,
      totalDurationMs: getExportDuration(clips.value),
    });
    return ok(outputPath);
  } catch (cause) {
    // The Rust side's error strings are written for the user and carry their
    // own recovery hints (missing FFmpeg, encoder failure tail), so they land
    // in `recovery` — the field the UI actually shows.
    return err(appError('IO', 'FFmpeg export failed.', String(cause), { cause }));
  } finally {
    unlisten();
  }
}
