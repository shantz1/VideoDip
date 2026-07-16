/**
 * The contract between VideoDip and any speech-to-text engine.
 *
 * This interface is the seam that keeps the AI layer independent of the
 * frontend, as required by `CLAUDE.md`. UI code depends on this type; it never
 * imports Whisper, WhisperX, or any provider package. That indirection is what
 * lets a plugin ship a new AI provider (ADR pending) without touching core, and
 * what lets `subtitle-engine` be unit-tested against a fake in microseconds
 * instead of invoking a model.
 *
 * Implementations live outside `packages/shared`. This file must stay free of
 * provider-specific detail — if a field only makes sense for Whisper, it does
 * not belong here.
 */

import type { Milliseconds, Normalized } from '../branded/branded.js';
import type { Result } from '../result/result.js';

/** A single word with its own timing. Drives word-level caption highlighting. */
export interface TranscribedWord {
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  /** Model confidence. Providers without a confidence score should omit it. */
  readonly confidence?: Normalized;
}

/** A contiguous run of speech, typically a caption-sized phrase. */
export interface TranscribedSegment {
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  /**
   * Word timings within this segment. May be empty: not every provider
   * produces word-level alignment, and consumers must degrade to
   * segment-level display rather than assuming this is populated.
   */
  readonly words: readonly TranscribedWord[];
  /** Speaker label when diarization ran. Absent otherwise. */
  readonly speaker?: string;
}

/** A completed transcription. */
export interface Transcription {
  readonly segments: readonly TranscribedSegment[];
  /** BCP-47 tag of the detected or requested language. */
  readonly language: string;
  /** Wall-clock duration of the transcription job, for telemetry and tuning. */
  readonly durationMs: Milliseconds;
}

/** Tunables for a transcription request. All optional; providers pick defaults. */
export interface TranscriptionOptions {
  /** BCP-47 language tag. Omit to let the provider auto-detect. */
  readonly language?: string;
  /** Request word-level timings. Providers may ignore if unsupported. */
  readonly wordTimestamps?: boolean;
  /** Request speaker diarization. Providers may ignore if unsupported. */
  readonly diarize?: boolean;
  /** Domain hint to bias decoding (names, jargon). */
  readonly prompt?: string;
}

/** Progress for a running transcription. */
export interface TranscriptionProgress {
  /** Completion in `[0, 1]`. */
  readonly progress: Normalized;
  /** Human-readable current phase, e.g. `"Aligning words"`. */
  readonly stage: string;
  /** Estimated time remaining, when the provider can estimate it. */
  readonly etaMs?: Milliseconds;
}

/** What a provider can actually do, so the UI can adapt before invoking it. */
export interface TranscriptionCapabilities {
  readonly wordTimestamps: boolean;
  readonly diarization: boolean;
  /** True when the provider runs locally with no network. */
  readonly offline: boolean;
  /** True when the provider can use a GPU on this machine. */
  readonly gpuAccelerated: boolean;
  /** BCP-47 tags, or `'auto'` if the provider accepts any language. */
  readonly languages: readonly string[] | 'auto';
}

/**
 * A speech-to-text engine.
 *
 * Implementations are constructor-injected. Never import one directly from a
 * consumer — depend on this interface.
 */
export interface TranscriptionProvider {
  /** Stable identifier, e.g. `'faster-whisper'`. */
  readonly id: string;
  /** Human-readable name for provider pickers. */
  readonly name: string;

  /**
   * Reports what this provider supports on this machine.
   *
   * Call before {@link transcribe} to adapt the UI. Results may depend on
   * runtime facts such as whether a GPU or model file is present, so do not
   * cache this across sessions.
   */
  capabilities(): Promise<TranscriptionCapabilities>;

  /**
   * Whether the provider is ready to run right now.
   *
   * Distinct from {@link capabilities}: a provider can be capable in principle
   * but unavailable because its model has not been downloaded yet. Offline-first
   * means this must be answerable without a network call.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Transcribes an audio file.
   *
   * @param audioPath - Absolute path to a local audio file.
   * @param options - Request tunables.
   * @param signal - Aborts the job. Implementations must honour this and must
   *   terminate any child process they spawned — a cancelled 4K transcription
   *   that leaves Whisper running is a resource leak the user cannot see.
   * @param onProgress - Invoked as the job advances. Never assume it fires.
   *
   * Returns a `Result` rather than throwing. Cancellation surfaces as
   * `Err<AppError>` with code `'CANCELLED'`, not as a rejection.
   */
  transcribe(
    audioPath: string,
    options?: TranscriptionOptions,
    signal?: AbortSignal,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<Result<Transcription>>;
}
