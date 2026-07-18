import type { ClipId, TrackId, TransitionId } from '@videodip/shared';
import type { TimelineIdProvider } from './identity.types.js';

/** Creates production timeline identities backed by the platform UUID generator. */
export function createRandomTimelineIdProvider(): TimelineIdProvider {
  return {
    nextClipId: () => crypto.randomUUID() as ClipId,
    nextTrackId: () => crypto.randomUUID() as TrackId,
    nextTransitionId: () => crypto.randomUUID() as TransitionId,
  };
}

/**
 * Creates a repeatable per-entity ID sequence for transaction replay and tests.
 *
 * Providers created with the same non-empty namespace produce the same IDs when called
 * in the same order. Counters are private to the returned provider and never persisted.
 */
export function createDeterministicTimelineIdProvider(namespace: string): TimelineIdProvider {
  const normalizedNamespace = namespace.trim();
  if (!normalizedNamespace) {
    throw new Error('A deterministic timeline ID namespace must not be empty.');
  }

  let clipSequence = 0;
  let trackSequence = 0;
  let transitionSequence = 0;

  return {
    nextClipId: () => `${normalizedNamespace}-clip-${++clipSequence}` as ClipId,
    nextTrackId: () => `${normalizedNamespace}-track-${++trackSequence}` as TrackId,
    nextTransitionId: () =>
      `${normalizedNamespace}-transition-${++transitionSequence}` as TransitionId,
  };
}
