import { describe, expect, it } from 'vitest';
import { parseRangeHeader, startMediaServer } from './media-server.js';

describe('parseRangeHeader', () => {
  it('parses a bounded range', () => {
    expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
  });

  it('parses an open-ended range to the end of the file', () => {
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('clamps an end past the file to the last byte', () => {
    expect(parseRangeHeader('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('returns null for absent, malformed, or unsatisfiable ranges', () => {
    expect(parseRangeHeader(undefined, 1000)).toBeNull();
    expect(parseRangeHeader('bytes=-', 1000)).toBeNull();
    expect(parseRangeHeader('frames=0-10', 1000)).toBeNull();
    expect(parseRangeHeader('bytes=1000-', 1000)).toBeNull();
    expect(parseRangeHeader('bytes=50-10', 1000)).toBeNull();
    expect(parseRangeHeader('bytes=0-99', 0)).toBeNull();
  });
});

describe('startMediaServer', () => {
  it('registers files to stable loopback URLs and refuses everything else', async () => {
    const server = await startMediaServer();
    try {
      const url = server.register('C:\\media\\a.mp4');
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/media\/0$/);
      // Same file → same URL; new file → new token.
      expect(server.register('C:\\media\\a.mp4')).toBe(url);
      expect(server.register('C:\\media\\b.mp4')).toMatch(/\/media\/1$/);

      // An unregistered token is a 404, not a directory traversal surface.
      const origin = url.slice(0, url.indexOf('/media/'));
      const stray = await fetch(`${origin}/media/99`);
      expect(stray.status).toBe(404);
      const traversal = await fetch(`${origin}/media/../secrets`);
      expect(traversal.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
