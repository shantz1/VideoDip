import { ok, type Result } from '@videodip/shared';
import { validateTimeline } from '../document/document.service.js';
import type { TimelineDocument } from '../document/document.types.js';
import type { TimelineRuntimeIndex } from './runtime-index.types.js';

/**
 * Builds validated runtime identity maps without adding cache state to the document.
 *
 * Validation happens first so duplicate identities cannot be silently overwritten by
 * JavaScript `Map` semantics.
 */
export function createTimelineRuntimeIndex(
  document: TimelineDocument,
): Result<TimelineRuntimeIndex> {
  const validation = validateTimeline(document);
  if (!validation.ok) return validation;

  return ok({
    tracksById: new Map(document.tracks.map((track) => [track.id, track])),
    clipsById: new Map(
      document.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)),
    ),
    transitionsById: new Map(document.transitions.map((transition) => [transition.id, transition])),
  });
}
