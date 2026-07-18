import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname } from 'node:path';

/**
 * Loopback HTTP server that exposes exactly the media files a render job
 * references — nothing else on disk — to the headless browser.
 *
 * Remotion's asset pipeline (OffthreadVideo frame extraction, audio
 * stitching) only accepts http(s) URLs; plain paths and `file://` are
 * refused. The desktop preview solves this with Tauri's asset protocol;
 * this is the sidecar's equivalent. Bound to 127.0.0.1, so nothing leaves
 * the machine (ADR-0011: no network at export time — loopback is not
 * network).
 */
export interface MediaServer {
  /** Maps an absolute file path to the loopback URL that serves it. */
  readonly register: (filePath: string) => string;
  readonly close: () => Promise<void>;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
};

/**
 * Parses an HTTP `Range` header against a known file size.
 *
 * Video seeking depends on correct 206 responses, so this is factored out
 * pure and tested. Returns `null` for absent or unusable ranges — the caller
 * then serves the whole file with a plain 200, which every consumer accepts.
 */
export function parseRangeHeader(
  header: string | undefined,
  size: number,
): { readonly start: number; readonly end: number } | null {
  if (header === undefined || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;
  if (rawStart === '') {
    // Suffix form: last N bytes.
    const suffix = Math.min(Number(rawEnd), size);
    return suffix === 0 ? null : { start: size - suffix, end: size - 1 };
  }
  const start = Number(rawStart);
  if (start >= size) return null;
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  return end < start ? null : { start, end };
}

/** Starts the loopback media server on an OS-assigned port. */
export async function startMediaServer(): Promise<MediaServer> {
  const filesByToken = new Map<string, string>();
  const tokensByFile = new Map<string, string>();

  const server: Server = createServer((request, response) => {
    const token = (request.url ?? '').replace(/^\/media\//, '').split('?')[0] ?? '';
    const filePath = filesByToken.get(token);
    if (filePath === undefined || (request.method !== 'GET' && request.method !== 'HEAD')) {
      response.writeHead(404).end();
      return;
    }
    void stat(filePath)
      .then((stats) => {
        const contentType =
          CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        const range = parseRangeHeader(request.headers.range, stats.size);
        const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' };
        if (request.method === 'HEAD') {
          response.writeHead(200, { ...headers, 'Content-Length': stats.size }).end();
          return;
        }
        if (range === null) {
          response.writeHead(200, { ...headers, 'Content-Length': stats.size });
          createReadStream(filePath).pipe(response);
          return;
        }
        response.writeHead(206, {
          ...headers,
          'Content-Length': range.end - range.start + 1,
          'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
        });
        createReadStream(filePath, range).pipe(response);
      })
      .catch(() => {
        response.writeHead(404).end();
      });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('The media server did not report a usable loopback address.');
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    register: (filePath: string): string => {
      const existing = tokensByFile.get(filePath);
      if (existing !== undefined) return `${origin}/media/${existing}`;
      const token = String(filesByToken.size);
      filesByToken.set(token, filePath);
      tokensByFile.set(filePath, token);
      return `${origin}/media/${token}`;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // A lingering keep-alive connection must not wedge process exit.
        server.closeAllConnections();
      }),
  };
}
