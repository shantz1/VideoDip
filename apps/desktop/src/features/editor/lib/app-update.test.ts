import { describe, expect, it, vi } from 'vitest';
import { createBrowserAppUpdatePort, createTauriAppUpdatePort } from './app-update';

const discovered = (overrides?: {
  downloadAndInstall?: (onEvent?: (event: never) => void) => Promise<void>;
}) => ({
  version: '0.2.0',
  body: 'Subtitle fixes',
  downloadAndInstall: overrides?.downloadAndInstall ?? (async () => undefined),
});

describe('createTauriAppUpdatePort', () => {
  it('resolves the discovered version and notes', async () => {
    const port = createTauriAppUpdatePort({
      check: async () => discovered(),
      relaunch: async () => undefined,
    });

    const result = await port.check();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ version: '0.2.0', notes: 'Subtitle fixes' });
  });

  it('treats an unreachable feed as up to date, never an error', async () => {
    const port = createTauriAppUpdatePort({
      check: async () => {
        throw new Error('offline');
      },
      relaunch: async () => undefined,
    });

    const result = await port.check();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it('reports normalized download progress from byte events', async () => {
    const events = [
      { event: 'Started', data: { contentLength: 200 } },
      { event: 'Progress', data: { chunkLength: 50 } },
      { event: 'Progress', data: { chunkLength: 150 } },
      { event: 'Finished' },
    ] as const;
    const port = createTauriAppUpdatePort({
      check: async () =>
        discovered({
          downloadAndInstall: async (onEvent) => {
            for (const event of events) onEvent?.(event as never);
          },
        }),
      relaunch: async () => undefined,
    });
    await port.check();

    const fractions: number[] = [];
    const result = await port.downloadAndInstall((fraction) => fractions.push(fraction));

    expect(result.ok).toBe(true);
    expect(fractions).toEqual([0.25, 1, 1]);
  });

  it('rejects a download before any update was discovered', async () => {
    const port = createTauriAppUpdatePort({
      check: async () => null,
      relaunch: async () => undefined,
    });

    const result = await port.downloadAndInstall();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
  });

  it('surfaces a failed staging as a retryable error with recovery', async () => {
    const port = createTauriAppUpdatePort({
      check: async () =>
        discovered({
          downloadAndInstall: async () => {
            throw new Error('signature mismatch');
          },
        }),
      relaunch: async () => undefined,
    });
    await port.check();

    const result = await port.downloadAndInstall();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROCESS_FAILED');
    expect(result.error.recovery.length).toBeGreaterThan(0);
  });

  it('restarts through the injected process API', async () => {
    const relaunch = vi.fn(async () => undefined);
    const port = createTauriAppUpdatePort({ check: async () => null, relaunch });

    const result = await port.restart();
    expect(result.ok).toBe(true);
    expect(relaunch).toHaveBeenCalledOnce();
  });
});

describe('createBrowserAppUpdatePort', () => {
  it('is silently up to date and refuses desktop-only operations', async () => {
    const port = createBrowserAppUpdatePort();

    const check = await port.check();
    expect(check.ok && check.value === null).toBe(true);

    const download = await port.downloadAndInstall();
    expect(!download.ok && download.error.code === 'UNSUPPORTED').toBe(true);
  });
});
