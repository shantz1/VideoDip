import { describe, expect, it, vi } from 'vitest';
import { probeMediaDuration } from './probe-media';

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
