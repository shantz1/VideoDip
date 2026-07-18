import type { ClipId, TrackId, TransitionId } from '@videodip/shared';
import type { Clip, ClipTransition, Track } from '../document/document.types.js';

/**
 * Non-persisted identity lookups derived from one immutable timeline document.
 *
 * An index is valid only for the document used to build it. Consumers rebuild it after a
 * committed transaction instead of mutating maps alongside the persisted aggregate.
 */
export interface TimelineRuntimeIndex {
  readonly clipsById: ReadonlyMap<ClipId, Clip>;
  readonly tracksById: ReadonlyMap<TrackId, Track>;
  readonly transitionsById: ReadonlyMap<TransitionId, ClipTransition>;
}
