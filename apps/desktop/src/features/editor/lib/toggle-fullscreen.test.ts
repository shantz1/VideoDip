import { describe, expect, it, vi } from 'vitest';
import { toggleFullscreen, type FullscreenController } from './toggle-fullscreen';

describe('toggleFullscreen', () => {
  it('enters fullscreen from windowed mode', async () => {
    const controller: FullscreenController = {
      isFullscreen: vi.fn().mockResolvedValue(false),
      setFullscreen: vi.fn().mockResolvedValue(undefined),
    };

    expect(await toggleFullscreen(controller)).toEqual({ ok: true, value: true });
    expect(controller.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('exits fullscreen from fullscreen mode', async () => {
    const controller: FullscreenController = {
      isFullscreen: vi.fn().mockResolvedValue(true),
      setFullscreen: vi.fn().mockResolvedValue(undefined),
    };

    expect(await toggleFullscreen(controller)).toEqual({ ok: true, value: false });
    expect(controller.setFullscreen).toHaveBeenCalledWith(false);
  });

  it('returns a recoverable error when the platform rejects the request', async () => {
    const controller: FullscreenController = {
      isFullscreen: vi.fn().mockRejectedValue(new Error('denied')),
      setFullscreen: vi.fn(),
    };

    const result = await toggleFullscreen(controller);
    expect(result.ok).toBe(false);
  });
});
