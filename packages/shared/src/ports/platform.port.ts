import type { JobId, MediaLocator, Normalized, ProjectId } from '../branded/branded.js';
import type { Result } from '../result/result.js';

/** Media categories understood by every VideoDip host. */
export type MediaKind = 'video' | 'audio';

/** Host-neutral result of choosing or importing one media source. */
export interface ImportedMediaReference {
  /** Opaque to shared UI: an absolute path on desktop or storage key in a browser. */
  readonly locator: MediaLocator;
  readonly name: string;
  readonly kind: MediaKind;
  readonly sizeBytes?: number;
}

/** Optional restrictions for a user-initiated media picker. */
export interface MediaImportOptions {
  readonly kinds?: readonly MediaKind[];
  readonly multiple?: boolean;
}

/**
 * User-initiated media acquisition.
 *
 * Cancellation is a successful empty array. Errors mean the host failed to
 * present or read its picker, not that the user changed their mind.
 */
export interface MediaImportPort {
  pickMedia(
    options?: MediaImportOptions,
    signal?: AbortSignal,
  ): Promise<Result<readonly ImportedMediaReference[]>>;
}

/** A temporary playable URL whose host resources require explicit release. */
export interface MediaSourceLease {
  readonly url: string;
  /** Releases object URLs or other host resources. Safe to call more than once. */
  release(): void;
}

/** Resolves an opaque locator into a source the shared preview can play. */
export interface MediaSourcePort {
  acquireSource(locator: MediaLocator, signal?: AbortSignal): Promise<Result<MediaSourceLease>>;
}

/**
 * Durable project storage, parameterized to avoid importing downstream domain
 * models into the base of the dependency graph.
 */
export interface ProjectRepository<TProject, TSummary> {
  list(signal?: AbortSignal): Promise<Result<readonly TSummary[]>>;
  load(id: ProjectId, signal?: AbortSignal): Promise<Result<TProject>>;
  save(project: TProject, signal?: AbortSignal): Promise<Result<void>>;
  delete(id: ProjectId, signal?: AbortSignal): Promise<Result<void>>;
}

/** Host-neutral progress for a long-running video export. */
export interface VideoExportProgress {
  readonly jobId: JobId;
  readonly fraction: Normalized;
  readonly stage: string;
}

/** A completed export, including a host locator when one remains addressable. */
export interface VideoExportReceipt {
  readonly jobId: JobId;
  readonly outputName: string;
  readonly locator?: MediaLocator;
}

/**
 * Video export capability supplied by a desktop or browser host.
 *
 * The request stays generic because its shape belongs to the application layer
 * that owns timeline/render settings. User cancellation is `Ok<null>`.
 */
export interface VideoExportPort<TRequest> {
  exportVideo(
    request: TRequest,
    signal?: AbortSignal,
    onProgress?: (progress: VideoExportProgress) => void,
  ): Promise<Result<VideoExportReceipt | null>>;
}
