import { mediaLocatorSchema } from '@videodip/shared';
import { describe, expect, it, vi } from 'vitest';
import { probeMediaDuration, probeMediaMetadata } from './probe-media';

describe('probeMediaDuration', () => {
  it('converts decoded seconds to integer milliseconds', async () => {
    const load = vi.fn().mockResolvedValue(4.2346);
    const result = await probeMediaDuration('asset://clip.mp4', 'video', load);

    expect(result).toEqual({ ok: true, value: 4235 });
    expect(load).toHaveBeenCalledWith('asset://clip.mp4', 'video');
  });

  it('returns a recoverable error for invalid metadata', async () => {
    const result = await probeMediaDuration('asset://broken.mp4', 'video', async () => Number.NaN);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.recovery).toContain('adjusted manually');
  });

  it('returns a recoverable error when decoding fails', async () => {
    const result = await probeMediaDuration('asset://broken.wav', 'audio', async () => {
      throw new Error('decoder failed');
    });

    expect(result.ok).toBe(false);
  });
});

describe('probeMediaMetadata', () => {
  it('runs deterministic FFprobe args and validates the returned JSON', async () => {
    const run = vi.fn().mockResolvedValue(
      JSON.stringify({
        format: { format_name: 'matroska', duration: '5.25' },
        streams: [{ index: 0, codec_type: 'video', codec_name: 'vp9' }],
      }),
    );
    const locator = mediaLocatorSchema.parse('C:\\media\\clip.mkv');

    const result = await probeMediaMetadata(locator, run);
    expect(result.ok && result.value.duration).toBe(5250);
    expect(run.mock.calls[0]?.[0].at(-1)).toBe(locator);
  });

  it('returns a retryable process error when the host probe fails', async () => {
    const result = await probeMediaMetadata(
      mediaLocatorSchema.parse('C:\\media\\broken.mkv'),
      async () => Promise.reject(new Error('ffprobe missing')),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PROCESS_FAILED');
      expect(result.error.retryable).toBe(true);
    }
  });
});
