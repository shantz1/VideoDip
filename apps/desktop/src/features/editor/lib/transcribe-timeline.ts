import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join, tempDir } from '@tauri-apps/api/path';
import {
  buildTimelineAudioArgs,
  getTimelineAudioDuration,
  type TimelineAudioClip,
} from '@videodip/media-engine';
import { appError, err, ok, type AssetId, type Milliseconds, type Result } from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';

/**
 * Collects every enabled, placed clip as an audible timeline segment.
 *
 * All media tracks participate — a voiceover on an audio track is speech
 * worth captioning; anything the user muted is excluded later by the argv
 * builder. A clip whose asset is missing is an error, not a skip: captions
 * silently missing a scene's dialogue would be indistinguishable from the
 * recognizer failing.
 */
export function toTimelineAudioClips(
  document: TimelineDocument,
  resolvePath: (assetId: AssetId) => string | undefined,
): Result<readonly TimelineAudioClip[]> {
  const clips: TimelineAudioClip[] = [];
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      if (!clip.isEnabled) continue;
      const src = resolvePath(clip.assetId);
      if (src === undefined) {
        return err(
          appError(
            'NOT_FOUND',
            `A timeline clip references missing media (asset ${clip.assetId}).`,
            'Remove the clip whose media file is gone, or re-import the file, then retry.',
          ),
        );
      }
      clips.push({
        src,
        sourceStart: clip.sourceStart,
        duration: clip.duration,
        start: clip.start,
        volume: clip.audio.volume,
        isMuted: clip.audio.isMuted,
      });
    }
  }
  return ok(clips);
}

/** Payload of the Rust side's `export-progress` events. */
interface ExportProgressEvent {
  readonly taskId: string;
  readonly fraction: number;
}

const FLATTEN_TIMEOUT_MS = 10 * 60 * 1_000;

/**
 * Mixes the timeline's audible clips into one mono 16 kHz WAV in the OS
 * temp directory and resolves to its path plus the mix duration.
 *
 * This is the first half of whole-timeline transcription (the second half
 * is handing the WAV to the Whisper provider): because clips are delayed to
 * their real positions, the recognizer's timestamps come back already in
 * timeline time and need no per-clip offset mapping. Reuses the generic
 * Rust `export_video` FFmpeg runner — the argv is just audio-only.
 */
export async function flattenTimelineAudio(
  document: TimelineDocument,
  resolvePath: (assetId: AssetId) => string | undefined,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Result<{ readonly path: string; readonly durationMs: Milliseconds }>> {
  if (!isTauri()) {
    return err(
      appError(
        'UNSUPPORTED',
        'Timeline transcription needs the desktop shell.',
        'Run the desktop app (`pnpm tauri dev`) — the browser preview cannot spawn FFmpeg.',
      ),
    );
  }

  const clips = toTimelineAudioClips(document, resolvePath);
  if (!clips.ok) return clips;

  let outputPath: string;
  try {
    outputPath = await join(await tempDir(), `videodip-transcribe-${crypto.randomUUID()}.wav`);
  } catch (cause) {
    return err(
      appError('IO', 'Could not locate the temp directory.', 'Retry generating subtitles.', {
        cause,
      }),
    );
  }
  const args = buildTimelineAudioArgs(clips.value, outputPath);
  if (!args.ok) return args;
  const durationMs = getTimelineAudioDuration(clips.value);

  const taskId = crypto.randomUUID();
  const cancel = () => {
    void invoke('cancel_export', { taskId }).catch(() => undefined);
  };
  const timeout = setTimeout(cancel, FLATTEN_TIMEOUT_MS);
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<ExportProgressEvent>('export-progress', (event) => {
      if (event.payload.taskId !== taskId || !Number.isFinite(event.payload.fraction)) return;
      onProgress(Math.max(0, Math.min(1, event.payload.fraction)));
    });
    if (signal?.aborted) return err(flattenCancelledError());
    signal?.addEventListener('abort', cancel, { once: true });
    await invoke('export_video', { taskId, args: args.value, totalDurationMs: durationMs });
    if (signal?.aborted) return err(flattenCancelledError());
    return ok({ path: outputPath, durationMs });
  } catch (cause) {
    if (signal?.aborted) return err(flattenCancelledError());
    return err(
      appError('IO', 'Could not prepare the timeline audio.', String(cause), { cause }),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    unlisten?.();
  }
}

function flattenCancelledError() {
  return appError('CANCELLED', 'Timeline transcription was cancelled.', 'Generate again anytime.', {
    retryable: true,
  });
}
