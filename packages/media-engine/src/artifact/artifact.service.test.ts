import {
  appError,
  err,
  ms,
  ok,
  type AppError,
  type AssetId,
  type MediaLocator,
  type Result,
} from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { MediaArtifactService, getMediaArtifactCacheKey } from './artifact.service.js';
import type {
  GeneratedMediaArtifact,
  MediaArtifact,
  MediaArtifactCache,
  MediaArtifactRequest,
  MediaArtifactWorker,
  MediaArtifactWorkerContext,
} from './artifact.types.js';

function request(id = 'asset-a'): MediaArtifactRequest {
  return {
    assetId: id as AssetId,
    source: `media://${id}` as MediaLocator,
    sourceVersion: 'size:100;modified:1',
    options: {
      kind: 'thumbnail',
      time: ms(1_000),
      width: 320,
      height: 180,
      format: 'jpeg',
    },
  };
}

function generated(locator = 'temp://thumbnail'): GeneratedMediaArtifact {
  return {
    kind: 'thumbnail',
    locator: locator as MediaLocator,
    contentType: 'image/jpeg',
    sizeBytes: 128,
    width: 320,
    height: 180,
  };
}

function stored(cacheKey: string, locator = 'cache://thumbnail'): MediaArtifact {
  return { ...generated(locator), cacheKey };
}

class FakeCache implements MediaArtifactCache {
  readonly getKeys: string[] = [];
  readonly putKeys: string[] = [];
  getResult: Result<MediaArtifact | null, AppError> = ok(null);

  async get(cacheKey: string): Promise<Result<MediaArtifact | null, AppError>> {
    this.getKeys.push(cacheKey);
    return this.getResult;
  }

  async put(
    cacheKey: string,
    artifact: GeneratedMediaArtifact,
  ): Promise<Result<MediaArtifact, AppError>> {
    this.putKeys.push(cacheKey);
    return ok({ ...artifact, cacheKey });
  }
}

class FakeWorker implements MediaArtifactWorker {
  readonly requests: MediaArtifactRequest[] = [];

  constructor(
    private readonly run: (
      request: MediaArtifactRequest,
      context: MediaArtifactWorkerContext,
    ) => Promise<Result<GeneratedMediaArtifact, AppError>> = async () => ok(generated()),
  ) {}

  async generate(
    artifactRequest: MediaArtifactRequest,
    context: MediaArtifactWorkerContext,
  ): Promise<Result<GeneratedMediaArtifact, AppError>> {
    this.requests.push(artifactRequest);
    return this.run(artifactRequest, context);
  }
}

async function flushQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('MediaArtifactService', () => {
  it('rejects invalid requests before touching host adapters', async () => {
    const cache = new FakeCache();
    const worker = new FakeWorker();
    const service = new MediaArtifactService(worker, cache);
    const invalid = {
      ...request(),
      options: { ...request().options, width: 0 },
    } as MediaArtifactRequest;

    const result = await service.getOrCreate(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(cache.getKeys).toHaveLength(0);
    expect(worker.requests).toHaveLength(0);
  });

  it('returns a matching cache hit without starting a worker', async () => {
    const artifactRequest = request();
    const key = getMediaArtifactCacheKey(artifactRequest);
    const cache = new FakeCache();
    cache.getResult = ok(stored(key));
    const worker = new FakeWorker();
    const service = new MediaArtifactService(worker, cache);

    const result = await service.getOrCreate(artifactRequest);

    expect(result).toEqual(ok(stored(key)));
    expect(worker.requests).toHaveLength(0);
    expect(cache.putKeys).toHaveLength(0);
  });

  it('generates, validates, stores and reports monotonic overall progress on a miss', async () => {
    const cache = new FakeCache();
    const worker = new FakeWorker(async (_artifactRequest, context) => {
      context.onProgress(0.8);
      context.onProgress(0.2);
      context.onProgress(1);
      return ok(generated());
    });
    const service = new MediaArtifactService(worker, cache);
    const progress: number[] = [];

    const result = await service.getOrCreate(request(), {
      onProgress: (update) => progress.push(update.ratio),
    });

    expect(result.ok).toBe(true);
    expect(cache.getKeys).toHaveLength(1);
    expect(cache.putKeys).toEqual(cache.getKeys);
    expect(progress.at(0)).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((ratio, index) => index === 0 || ratio >= progress[index - 1])).toBe(
      true,
    );
  });

  it('never runs more workers than the configured concurrency', async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<(result: Result<GeneratedMediaArtifact, AppError>) => void> = [];
    const worker = new FakeWorker(
      () =>
        new Promise((resolve) => {
          active += 1;
          maximum = Math.max(maximum, active);
          releases.push((result) => {
            active -= 1;
            resolve(result);
          });
        }),
    );
    const service = new MediaArtifactService(worker, new FakeCache(), { maxConcurrency: 2 });

    const first = service.getOrCreate(request('asset-1'));
    const second = service.getOrCreate(request('asset-2'));
    const third = service.getOrCreate(request('asset-3'));
    await flushQueue();
    expect(worker.requests).toHaveLength(2);
    expect(maximum).toBe(2);

    const releaseFirst = releases.shift();
    if (releaseFirst === undefined) throw new Error('First worker did not start.');
    releaseFirst(ok(generated('temp://one')));
    await first;
    await flushQueue();
    expect(worker.requests).toHaveLength(3);
    expect(maximum).toBe(2);

    for (const release of releases.splice(0)) release(ok(generated('temp://remaining')));
    await Promise.all([second, third]);
  });

  it('cancels a queued request without starting another worker', async () => {
    let releaseFirst: ((result: Result<GeneratedMediaArtifact, AppError>) => void) | undefined;
    const worker = new FakeWorker(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const service = new MediaArtifactService(worker, new FakeCache(), { maxConcurrency: 1 });
    const first = service.getOrCreate(request('asset-1'));
    const controller = new AbortController();
    const second = service.getOrCreate(request('asset-2'), { signal: controller.signal });
    await flushQueue();
    controller.abort();

    const secondResult = await second;
    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) expect(secondResult.error.code).toBe('CANCELLED');
    expect(worker.requests).toHaveLength(1);
    if (releaseFirst === undefined) throw new Error('First worker did not start.');
    releaseFirst(ok(generated()));
    await first;
  });

  it('aborts a worker when its timeout expires', async () => {
    const worker = new FakeWorker(
      async (_artifactRequest, context) =>
        await new Promise((resolve) => {
          context.signal.addEventListener(
            'abort',
            () =>
              resolve(
                err(appError('CANCELLED', 'Worker stopped.', 'Retry the artifact generation.')),
              ),
            { once: true },
          );
        }),
    );
    const service = new MediaArtifactService(worker, new FakeCache());

    const result = await service.getOrCreate(request(), { timeoutMs: 5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CANCELLED');
      expect(result.error.message).toContain('timed out');
      expect(result.error.context).toEqual({ reason: 'timeout' });
    }
  });

  it('rejects a worker artifact whose kind does not match the request', async () => {
    const worker = new FakeWorker(async () =>
      ok({
        kind: 'waveform',
        locator: 'temp://waveform' as MediaLocator,
        contentType: 'application/vnd.videodip.waveform+json',
        sizeBytes: 32,
        sampleCount: 128,
      }),
    );
    const service = new MediaArtifactService(worker, new FakeCache());

    const result = await service.getOrCreate(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PROCESS_FAILED');
  });

  it('rejects a cache artifact whose dimensions do not match the request', async () => {
    const artifactRequest = request();
    const key = getMediaArtifactCacheKey(artifactRequest);
    const cache = new FakeCache();
    cache.getResult = ok({ ...stored(key), width: 640 });
    const worker = new FakeWorker();
    const service = new MediaArtifactService(worker, cache);

    const result = await service.getOrCreate(artifactRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PROCESS_FAILED');
    expect(worker.requests).toHaveLength(0);
  });

  it('converts an adapter throw into a recoverable Result', async () => {
    const worker = new FakeWorker(async () => {
      throw new Error('adapter bug');
    });
    const service = new MediaArtifactService(worker, new FakeCache());

    const result = await service.getOrCreate(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN');
      expect(result.error.retryable).toBe(true);
    }
  });
});
