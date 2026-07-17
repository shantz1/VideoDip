import type { MediaKind } from '@videodip/media-engine';
import { appError, ms, tryCatchAsync, type Milliseconds, type Result } from '@videodip/shared';

/** Injectable decoder used to keep metadata probing testable without a browser. */
export type MediaDurationLoader = (source: string, kind: MediaKind) => Promise<number>;

const PROBE_TIMEOUT_MS = 10_000;

function loadDurationWithMediaElement(source: string, kind: MediaKind): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Media metadata probe timed out.'));
    }, PROBE_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute('src');
      element.load();
    };

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const { duration } = element;
      cleanup();
      resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error('The platform media decoder could not read this file.'));
    };
    element.src = source;
  });
}

/**
 * Reads a local media source's duration through the platform decoder.
 *
 * FFmpeg probing will eventually cover every accepted container. This decoder
 * path is still real metadata (never a guessed value) and works offline for
 * formats supported by the desktop webview.
 */
export function probeMediaDuration(
  source: string,
  kind: MediaKind,
  load: MediaDurationLoader = loadDurationWithMediaElement,
): Promise<Result<Milliseconds>> {
  return tryCatchAsync(
    async () => {
      const seconds = await load(source, kind);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('Media duration was missing or invalid.');
      }
      return ms(Math.round(seconds * 1000));
    },
    (cause) =>
      appError(
        'IO',
        'Could not read the media duration.',
        'The file can still be imported, but its timeline length must be adjusted manually.',
        { cause },
      ),
  );
}
