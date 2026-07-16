/**
 * Explicit success/failure values for fallible operations.
 *
 * Per `CLAUDE.md`, operations that can fail return a `Result` rather than
 * throwing. Throwing is reserved for programmer error — violated invariants that
 * indicate a bug, not a condition the caller should handle.
 *
 * The reason this is a hard rule rather than a preference: a thrown exception is
 * invisible in the type system, so a caller that forgets to handle it still
 * compiles. VideoDip runs long, expensive, user-initiated jobs (transcription,
 * export) where a silently swallowed failure means a creator loses work. Making
 * failure part of the return type means the compiler enforces the recovery path
 * that `CLAUDE.md` requires every error to have.
 */

/** A successful outcome carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed outcome carrying a typed error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The outcome of a fallible operation: either {@link Ok} or {@link Err}.
 *
 * Narrow with the `ok` discriminant, or use the {@link isOk} / {@link isErr}
 * guards.
 */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

/** Wraps a value as a successful {@link Result}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps an error as a failed {@link Result}. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard narrowing a {@link Result} to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard narrowing a {@link Result} to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Applies `fn` to the value of a successful result, passing failures through
 * untouched.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Chains a fallible operation onto a successful result, passing failures
 * through untouched. Use this instead of nesting `if (result.ok)` blocks.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Returns the success value, or `fallback` if the result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Runs a throwing function and captures any exception as an {@link Err}.
 *
 * This is the boundary adapter for third-party code we do not control (FFmpeg
 * wrappers, JSON.parse, filesystem calls). Use it at the edge of the system —
 * do not use it to paper over VideoDip code that should have returned a
 * `Result` in the first place.
 */
export function tryCatch<T>(fn: () => T, onError: (cause: unknown) => AppError): Result<T> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(onError(cause));
  }
}

/** Async counterpart to {@link tryCatch}. */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  onError: (cause: unknown) => AppError,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(onError(cause));
  }
}

/**
 * Machine-readable failure categories.
 *
 * Deliberately coarse. These exist so callers can branch on *how* to recover,
 * not to enumerate every possible cause — the human-readable detail lives in
 * {@link AppError.message}.
 */
export type ErrorCode =
  /** Input failed validation at a trust boundary. */
  | 'VALIDATION'
  /** A requested entity does not exist. */
  | 'NOT_FOUND'
  /** The operation is invalid given current state. */
  | 'CONFLICT'
  /** An external process (FFmpeg, Whisper) failed. */
  | 'PROCESS_FAILED'
  /** Filesystem or storage failure. */
  | 'IO'
  /** The user or system cancelled the operation. */
  | 'CANCELLED'
  /** A required capability is unavailable on this machine. */
  | 'UNSUPPORTED'
  /** A plugin misbehaved or violated its contract. */
  | 'PLUGIN'
  /** Cause is genuinely unknown. Prefer any other code. */
  | 'UNKNOWN';

/**
 * A structured, user-recoverable error.
 *
 * `CLAUDE.md` requires every error to carry a recovery path: {@link recovery}
 * is not optional decoration. If you cannot articulate what the user should do
 * about a failure, that is a signal the failure should not surface to them.
 */
export interface AppError {
  readonly code: ErrorCode;
  /** Developer-facing description. Not shown to users verbatim. */
  readonly message: string;
  /** User-facing, actionable next step. Required — see above. */
  readonly recovery: string;
  /** Whether retrying the identical operation could plausibly succeed. */
  readonly retryable: boolean;
  /** Underlying cause, preserved for logs. Never shown to users. */
  readonly cause?: unknown;
  /** Structured context for logs and telemetry. */
  readonly context?: Readonly<Record<string, unknown>>;
}

/** Constructs an {@link AppError}. */
export function appError(
  code: ErrorCode,
  message: string,
  recovery: string,
  options: { retryable?: boolean; cause?: unknown; context?: Record<string, unknown> } = {},
): AppError {
  return {
    code,
    message,
    recovery,
    retryable: options.retryable ?? false,
    ...(options.cause !== undefined ? { cause: options.cause } : {}),
    ...(options.context !== undefined ? { context: options.context } : {}),
  };
}
