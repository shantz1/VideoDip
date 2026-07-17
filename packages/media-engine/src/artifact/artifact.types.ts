import type { AppError, AssetId, MediaLocator, Milliseconds, Result } from '@videodip/shared';

/** Media-derived artifact categories understood by the cache pipeline. */
export type MediaArtifactKind = 'thumbnail' | 'waveform';

/** Options for extracting one representative video frame. */
export interface ThumbnailArtifactOptions {
  readonly kind: 'thumbnail';
  readonly time: Milliseconds;
  readonly width: number;
  readonly height: number;
  readonly format: 'jpeg' | 'webp';
}

/** Options for reducing decoded audio to a bounded peak envelope. */
export interface WaveformArtifactOptions {
  readonly kind: 'waveform';
  readonly samples: number;
}

/** Kind-specific, serializable artifact generation options. */
export type MediaArtifactOptions = ThumbnailArtifactOptions | WaveformArtifactOptions;

/** A cacheable unit of thumbnail or waveform work. */
export interface MediaArtifactRequest {
  readonly assetId: AssetId;
  readonly source: MediaLocator;
  /** Host-provided file revision, such as size + modified time or a content hash. */
  readonly sourceVersion: string;
  readonly options: MediaArtifactOptions;
}

/** A thumbnail written to a worker-owned temporary locator. */
export interface GeneratedThumbnailArtifact {
  readonly kind: 'thumbnail';
  readonly locator: MediaLocator;
  readonly contentType: 'image/jpeg' | 'image/webp';
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}

/** A waveform envelope written to a worker-owned temporary locator. */
export interface GeneratedWaveformArtifact {
  readonly kind: 'waveform';
  readonly locator: MediaLocator;
  readonly contentType: 'application/vnd.videodip.waveform+json';
  readonly sizeBytes: number;
  readonly sampleCount: number;
}

/** Validated worker output before it is committed to the durable cache. */
export type GeneratedMediaArtifact = GeneratedThumbnailArtifact | GeneratedWaveformArtifact;

/** A durable cache artifact that can be consumed by the editor. */
export type MediaArtifact = GeneratedMediaArtifact & {
  /** Opaque logical key; cache adapters must not treat it as a safe filesystem name. */
  readonly cacheKey: string;
};

/** Observable stages for an artifact request. */
export type MediaArtifactStage = 'queued' | 'cache' | 'generate' | 'store';

/** Monotonic progress reported by the orchestration service. */
export interface MediaArtifactProgress {
  readonly stage: MediaArtifactStage;
  /** Overall completion in the inclusive range 0..1. */
  readonly ratio: number;
  readonly message: string;
}

/** Per-call control for cancellation, timeout and progress observation. */
export interface MediaArtifactRunOptions {
  readonly signal?: AbortSignal;
  /** Includes time spent waiting for a bounded-concurrency permit. */
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: MediaArtifactProgress) => void;
}

/** Context passed to a host worker for one generation attempt. */
export interface MediaArtifactWorkerContext {
  readonly signal: AbortSignal;
  /** Worker-local generation completion in the inclusive range 0..1. */
  readonly onProgress: (ratio: number) => void;
}

/** Host boundary for CPU/process-heavy media artifact generation. */
export interface MediaArtifactWorker {
  generate(
    request: MediaArtifactRequest,
    context: MediaArtifactWorkerContext,
  ): Promise<Result<GeneratedMediaArtifact, AppError>>;
}

/** Host boundary for durable artifact cache reads and atomic commits. */
export interface MediaArtifactCache {
  get(cacheKey: string, signal: AbortSignal): Promise<Result<MediaArtifact | null, AppError>>;
  put(
    cacheKey: string,
    artifact: GeneratedMediaArtifact,
    signal: AbortSignal,
  ): Promise<Result<MediaArtifact, AppError>>;
}
