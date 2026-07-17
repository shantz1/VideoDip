import { appError, err, ok, type AppError, type Result } from '@videodip/shared';
import { z } from 'zod';
import type {
  GeneratedMediaArtifact,
  MediaArtifact,
  MediaArtifactCache,
  MediaArtifactProgress,
  MediaArtifactRequest,
  MediaArtifactRunOptions,
  MediaArtifactWorker,
} from './artifact.types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENCY = 2;

/** Runtime validator for media artifact requests crossing a host boundary. */
export const mediaArtifactRequestSchema = z
  .object({
    assetId: z.string().trim().min(1),
    source: z.string().trim().min(1),
    sourceVersion: z.string().trim().min(1).max(512),
    options: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('thumbnail'),
          time: z.number().finite().nonnegative(),
          width: z.number().int().positive().max(4096),
          height: z.number().int().positive().max(4096),
          format: z.enum(['jpeg', 'webp']),
        })
        .strict(),
      z
        .object({
          kind: z.literal('waveform'),
          samples: z.number().int().min(16).max(100_000),
        })
        .strict(),
    ]),
  })
  .strict();

const thumbnailArtifactShape = {
  kind: z.literal('thumbnail'),
  locator: z.string().trim().min(1),
  contentType: z.enum(['image/jpeg', 'image/webp']),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
};

const waveformArtifactShape = {
  kind: z.literal('waveform'),
  locator: z.string().trim().min(1),
  contentType: z.literal('application/vnd.videodip.waveform+json'),
  sizeBytes: z.number().int().nonnegative(),
  sampleCount: z.number().int().positive(),
};

/** Runtime validator for uncached worker output crossing IPC or a worker edge. */
export const generatedMediaArtifactSchema = z.discriminatedUnion('kind', [
  z.object(thumbnailArtifactShape).strict(),
  z.object(waveformArtifactShape).strict(),
]);

/** Runtime validator for durable cache metadata crossing a host boundary. */
export const mediaArtifactSchema = z.discriminatedUnion('kind', [
  z.object({ ...thumbnailArtifactShape, cacheKey: z.string().min(1) }).strict(),
  z.object({ ...waveformArtifactShape, cacheKey: z.string().min(1) }).strict(),
]);

/** Runtime validator for bounded waveform files read by a presentation host. */
export const waveformDocumentSchema = z
  .object({
    version: z.literal(1),
    peaks: z.array(z.number().finite().min(0).max(1)).min(16).max(100_000),
  })
  .strict();

const cachedArtifactSchema = mediaArtifactSchema.nullable();

interface QueueEntry {
  readonly signal: AbortSignal;
  readonly resolve: (release: (() => void) | null) => void;
  readonly abort: () => void;
  isSettled: boolean;
}

/**
 * Builds a stable logical cache key from a validated request.
 *
 * The result intentionally is not a filesystem name. Native and browser cache
 * adapters may hash or encode it for storage without changing cache identity.
 */
export function getMediaArtifactCacheKey(request: MediaArtifactRequest): string {
  return JSON.stringify({
    version: 1,
    assetId: request.assetId,
    source: request.source,
    sourceVersion: request.sourceVersion,
    options: request.options,
  });
}

/**
 * Coordinates validated, cancellable media artifact work behind injected ports.
 *
 * The service bounds active workers, includes queue time in the timeout, checks
 * the durable cache first, validates every host result, and never buffers source
 * media or generated artifacts in JavaScript memory.
 */
export class MediaArtifactService {
  private readonly maxConcurrency: number;
  private readonly defaultTimeoutMs: number;
  private activeCount = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(
    private readonly worker: MediaArtifactWorker,
    private readonly cache: MediaArtifactCache,
    options: { readonly maxConcurrency?: number; readonly timeoutMs?: number } = {},
  ) {
    const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error('MediaArtifactService maxConcurrency must be a positive integer.');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('MediaArtifactService timeoutMs must be positive.');
    }
    this.maxConcurrency = maxConcurrency;
    this.defaultTimeoutMs = timeoutMs;
  }

  /** Generates or retrieves one artifact without exceeding the worker limit. */
  async getOrCreate(
    request: MediaArtifactRequest,
    options: MediaArtifactRunOptions = {},
  ): Promise<Result<MediaArtifact, AppError>> {
    let lastProgressRatio = 0;
    const report = (progress: MediaArtifactProgress) => {
      const ratio = Math.max(lastProgressRatio, Math.max(0, Math.min(1, progress.ratio)));
      lastProgressRatio = ratio;
      this.emit(options, { ...progress, ratio });
    };
    const parsed = mediaArtifactRequestSchema.safeParse(request);
    if (!parsed.success) {
      return err(
        appError(
          'VALIDATION',
          'Media artifact request failed validation.',
          'Retry after re-importing the source or choosing valid artifact settings.',
          { cause: parsed.error },
        ),
      );
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return err(
        appError(
          'VALIDATION',
          'Media artifact timeout must be a positive number.',
          'Retry with a positive timeout.',
        ),
      );
    }

    const operation = this.createOperationSignal(options.signal, timeoutMs);
    report({ stage: 'queued', ratio: 0, message: 'Waiting for media worker' });
    const release = await this.acquire(operation.signal);
    if (release === null) {
      operation.cleanup();
      return err(this.cancelledError(operation.didTimeOut()));
    }

    try {
      if (operation.signal.aborted) {
        return err(this.cancelledError(operation.didTimeOut()));
      }
      const cacheKey = getMediaArtifactCacheKey(request);
      report({ stage: 'cache', ratio: 0.05, message: 'Checking media cache' });
      const cached = await this.cache.get(cacheKey, operation.signal);
      if (operation.signal.aborted) {
        return err(this.cancelledError(operation.didTimeOut()));
      }
      if (!cached.ok) return cached;
      const validatedCached = cachedArtifactSchema.safeParse(cached.value);
      if (!validatedCached.success) {
        return err(this.invalidHostResult('cache', validatedCached.error));
      }
      if (validatedCached.data !== null) {
        if (
          validatedCached.data.cacheKey !== cacheKey ||
          !this.matchesRequest(validatedCached.data as MediaArtifact, request)
        ) {
          return err(this.invalidHostResult('cache', 'Cache key or artifact metadata mismatch.'));
        }
        report({ stage: 'cache', ratio: 1, message: 'Loaded from media cache' });
        return ok(validatedCached.data as MediaArtifact);
      }

      report({ stage: 'generate', ratio: 0.1, message: 'Generating media artifact' });
      const generated = await this.worker.generate(request, {
        signal: operation.signal,
        onProgress: (ratio) => {
          const bounded = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
          report({
            stage: 'generate',
            ratio: 0.1 + bounded * 0.8,
            message: 'Generating media artifact',
          });
        },
      });
      if (operation.signal.aborted) {
        return err(this.cancelledError(operation.didTimeOut()));
      }
      if (!generated.ok) return generated;
      const validatedGenerated = generatedMediaArtifactSchema.safeParse(generated.value);
      if (
        !validatedGenerated.success ||
        !this.matchesRequest(validatedGenerated.data as GeneratedMediaArtifact, request)
      ) {
        return err(
          this.invalidHostResult(
            'worker',
            validatedGenerated.success ? 'Artifact metadata mismatch.' : validatedGenerated.error,
          ),
        );
      }

      report({ stage: 'store', ratio: 0.92, message: 'Saving media artifact' });
      const stored = await this.cache.put(
        cacheKey,
        validatedGenerated.data as GeneratedMediaArtifact,
        operation.signal,
      );
      if (operation.signal.aborted) {
        return err(this.cancelledError(operation.didTimeOut()));
      }
      if (!stored.ok) return stored;
      const validatedStored = cachedArtifactSchema.safeParse(stored.value);
      if (
        !validatedStored.success ||
        validatedStored.data === null ||
        validatedStored.data.cacheKey !== cacheKey ||
        !this.matchesRequest(validatedStored.data as MediaArtifact, request)
      ) {
        return err(
          this.invalidHostResult(
            'cache',
            validatedStored.success ? 'Stored artifact identity mismatch.' : validatedStored.error,
          ),
        );
      }
      report({ stage: 'store', ratio: 1, message: 'Media artifact ready' });
      return ok(validatedStored.data as MediaArtifact);
    } catch (cause) {
      if (operation.signal.aborted) {
        return err(this.cancelledError(operation.didTimeOut()));
      }
      return err(
        appError(
          'UNKNOWN',
          'A media artifact adapter threw instead of returning a Result.',
          'Retry the operation. If it repeats, restart VideoDip and inspect the local logs.',
          { cause, retryable: true },
        ),
      );
    } finally {
      release();
      operation.cleanup();
    }
  }

  private emit(options: MediaArtifactRunOptions, progress: MediaArtifactProgress): void {
    try {
      options.onProgress?.(progress);
    } catch {
      // Observers are presentation concerns and must never break media work.
    }
  }

  private invalidHostResult(adapter: 'cache' | 'worker', cause: unknown): AppError {
    return appError(
      'PROCESS_FAILED',
      `The media ${adapter} returned an invalid artifact.`,
      'Clear generated media data and retry. If it repeats, restart VideoDip.',
      { cause, retryable: true },
    );
  }

  private matchesRequest(artifact: GeneratedMediaArtifact, request: MediaArtifactRequest): boolean {
    if (request.options.kind === 'thumbnail') {
      return (
        artifact.kind === 'thumbnail' &&
        artifact.width === request.options.width &&
        artifact.height === request.options.height &&
        artifact.contentType === `image/${request.options.format}`
      );
    }
    return artifact.kind === 'waveform' && artifact.sampleCount === request.options.samples;
  }

  private cancelledError(didTimeOut: boolean): AppError {
    return appError(
      'CANCELLED',
      didTimeOut
        ? 'Media artifact generation timed out.'
        : 'Media artifact generation was cancelled.',
      didTimeOut
        ? 'Retry, or raise the local media-worker timeout for unusually large sources.'
        : 'Retry the operation when you are ready.',
      { retryable: didTimeOut, context: { reason: didTimeOut ? 'timeout' : 'cancelled' } },
    );
  }

  private createOperationSignal(external: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    let didTimeOut = false;
    const abortFromExternal = () => controller.abort(external?.reason);
    if (external?.aborted) {
      abortFromExternal();
    } else {
      external?.addEventListener('abort', abortFromExternal, { once: true });
    }
    const timeout = setTimeout(() => {
      didTimeOut = true;
      controller.abort('timeout');
    }, timeoutMs);
    return {
      signal: controller.signal,
      didTimeOut: () => didTimeOut,
      cleanup: () => {
        clearTimeout(timeout);
        external?.removeEventListener('abort', abortFromExternal);
      },
    };
  }

  private acquire(signal: AbortSignal): Promise<(() => void) | null> {
    if (signal.aborted) return Promise.resolve(null);
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return Promise.resolve(this.createRelease());
    }
    return new Promise((resolve) => {
      const entry: QueueEntry = {
        signal,
        resolve,
        isSettled: false,
        abort: () => {
          if (entry.isSettled) return;
          entry.isSettled = true;
          const index = this.queue.indexOf(entry);
          if (index >= 0) this.queue.splice(index, 1);
          resolve(null);
        },
      };
      signal.addEventListener('abort', entry.abort, { once: true });
      this.queue.push(entry);
    });
  }

  private createRelease(): () => void {
    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      this.activeCount -= 1;
      this.startNext();
    };
  }

  private startNext(): void {
    while (this.activeCount < this.maxConcurrency) {
      const entry = this.queue.shift();
      if (entry === undefined) return;
      entry.signal.removeEventListener('abort', entry.abort);
      if (entry.isSettled || entry.signal.aborted) continue;
      entry.isSettled = true;
      this.activeCount += 1;
      entry.resolve(this.createRelease());
    }
  }
}
