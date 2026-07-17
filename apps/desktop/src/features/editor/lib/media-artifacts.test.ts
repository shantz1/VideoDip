import { ms, type AssetId, type MediaLocator } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  createTauriMediaArtifactCache,
  createTauriMediaArtifactWorker,
  type MediaArtifactInvoke,
} from './media-artifacts';

const request = {
  assetId: 'asset-a' as AssetId,
  source: 'C:\\media\\clip.mp4' as MediaLocator,
  sourceVersion: 'size:100;modified:1',
  options: {
    kind: 'thumbnail' as const,
    time: ms(1_000),
    width: 320,
    height: 180,
    format: 'jpeg' as const,
  },
};

const generated = {
  kind: 'thumbnail' as const,
  locator: 'C:\\cache\\staged.jpg' as MediaLocator,
  contentType: 'image/jpeg' as const,
  sizeBytes: 128,
  width: 320,
  height: 180,
};

it('runs native generation with a task id and no media bytes over IPC', async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const runInvoke: MediaArtifactInvoke = async (command, args) => {
    calls.push(args === undefined ? { command } : { command, args });
    return generated;
  };
  const progress: number[] = [];
  const worker = createTauriMediaArtifactWorker(runInvoke, () => 'task-1');

  const result = await worker.generate(request, {
    signal: new AbortController().signal,
    onProgress: (ratio) => progress.push(ratio),
  });

  expect(result.ok).toBe(true);
  expect(calls).toEqual([
    {
      command: 'generate_media_artifact',
      args: {
        taskId: 'task-1',
        request: { source: request.source, options: request.options },
      },
    },
  ]);
  expect(progress).toEqual([0.02, 1]);
});

it('cancels the actual native task when its signal aborts', async () => {
  const calls: string[] = [];
  let finish: ((value: unknown) => void) | undefined;
  const runInvoke: MediaArtifactInvoke = (command) => {
    calls.push(command);
    if (command === 'cancel_media_artifact') return Promise.resolve(undefined);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const controller = new AbortController();
  const worker = createTauriMediaArtifactWorker(runInvoke, () => 'task-2');
  const pending = worker.generate(request, { signal: controller.signal, onProgress: () => {} });

  controller.abort();
  finish?.(generated);
  const result = await pending;

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe('CANCELLED');
  expect(calls).toContain('cancel_media_artifact');
});

describe('native media artifact cache', () => {
  it('accepts a cache miss and validates an atomic cache write', async () => {
    const commands: string[] = [];
    const cached = { ...generated, cacheKey: 'key-a' };
    const runInvoke: MediaArtifactInvoke = async (command) => {
      commands.push(command);
      return command === 'get_media_artifact_cache' ? null : cached;
    };
    const cache = createTauriMediaArtifactCache(runInvoke);
    const signal = new AbortController().signal;

    expect(await cache.get('key-a', signal)).toEqual({ ok: true, value: null });
    expect(await cache.put('key-a', generated, signal)).toEqual({ ok: true, value: cached });
    expect(commands).toEqual(['get_media_artifact_cache', 'put_media_artifact_cache']);
  });

  it('rejects malformed cache metadata at the IPC boundary', async () => {
    const cache = createTauriMediaArtifactCache(async () => ({ kind: 'thumbnail' }));

    const result = await cache.get('key-a', new AbortController().signal);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('IO');
  });
});
