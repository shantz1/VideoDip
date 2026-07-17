import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { createMediaItem, type MediaItem } from '@videodip/media-engine';
import { appError, err, tryCatchAsync, type Result } from '@videodip/shared';
import { probeMediaDuration } from './probe-media';

/**
 * Extensions the media panel accepts.
 *
 * Narrow on purpose — broadens as `media-engine` gains real container/codec
 * probing rather than guessing from an extension list.
 */
const MEDIA_EXTENSIONS = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'mp3',
  'wav',
  'aac',
  'flac',
  'm4a',
  'ogg',
];

/**
 * Opens the native file picker and returns the media items the user selected.
 *
 * An empty array means the user cancelled — Tauri's `open()` resolves to
 * `null` in that case, which is a real, expected outcome, not a failure to
 * surface as an error.
 *
 * Returns `Err('UNSUPPORTED')` when run outside a Tauri window (e.g. `pnpm
 * dev` in a plain browser tab for fast UI iteration): the dialog plugin calls
 * an IPC bridge that only exists inside the desktop shell, so calling it from
 * a browser tab would otherwise throw an unhandled rejection instead of a
 * recoverable, user-facing message.
 */
export async function importMedia(): Promise<Result<readonly MediaItem[]>> {
  if (!isTauri()) {
    return err(
      appError(
        'UNSUPPORTED',
        'Attempted to open the native file dialog outside a Tauri window.',
        'Media import needs the desktop app — run `pnpm tauri dev`, not the browser preview.',
      ),
    );
  }

  return tryCatchAsync(
    async () => {
      const selection = await open({
        multiple: true,
        filters: [{ name: 'Video & Audio', extensions: MEDIA_EXTENSIONS }],
      });

      if (selection === null) return [];
      const paths = Array.isArray(selection) ? selection : [selection];
      return Promise.all(
        paths.map(async (path) => {
          const item = createMediaItem(path);
          const duration = await probeMediaDuration(convertFileSrc(path), item.kind);
          return duration.ok ? { ...item, duration: duration.value } : item;
        }),
      );
    },
    (cause) => appError('IO', 'The native file dialog failed.', 'Try importing again.', { cause }),
  );
}
