import type { ClipId, TrackId, TransitionId } from '@videodip/shared';

/**
 * Supplies timeline entity identities without coupling pure edits to ambient randomness.
 *
 * A single provider instance must be reused for every operation in one planned edit so
 * replaying the edit with an equivalent provider produces the same identities.
 */
export interface TimelineIdProvider {
  /** Returns an unused clip identity for the provider's current sequence. */
  readonly nextClipId: () => ClipId;
  /** Returns an unused track identity for the provider's current sequence. */
  readonly nextTrackId: () => TrackId;
  /** Returns an unused transition identity for the provider's current sequence. */
  readonly nextTransitionId: () => TransitionId;
}
