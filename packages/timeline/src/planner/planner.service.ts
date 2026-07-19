import { appError, err, ok, type Result } from '@videodip/shared';
import {
  addClip,
  addTrack,
  addTransition,
  moveClip,
  removeClip,
  removeTrack,
  removeTransition,
  reorderTrack,
  setClipAnimation,
  splitClip,
  trimClip,
  updateClipAudio,
  updateClipProperties,
  updateTransition,
  updateTrackState,
  type UpdateTrackStateInput,
} from '../document/document.service.js';
import type { TimelineDocument, Track } from '../document/document.types.js';
import { createTimelineTransaction } from '../history/history.service.js';
import type { TimelineOperation, TimelineTransaction } from '../history/history.types.js';
import { createRandomTimelineIdProvider } from '../identity/identity.service.js';
import type { TimelineEditIntent, TimelineEditPlannerOptions } from './planner.types.js';

/**
 * Converts one surface-neutral user intent into a validated atomic transaction.
 *
 * The existing document operations remain the only mutation rules. Planning
 * selects and orders those operations, supplies one identity provider, and
 * delegates initial/final validation to the transaction boundary. Nothing is
 * committed to history here, so a caller may safely reject a stale plan.
 */
export function planTimelineEdit(
  document: TimelineDocument,
  intent: TimelineEditIntent,
  options: TimelineEditPlannerOptions = {},
): Result<TimelineTransaction> {
  const idProvider = options.idProvider ?? createRandomTimelineIdProvider();
  const unlocked = validateUnlockedIntent(document, intent);
  if (!unlocked.ok) return unlocked;

  switch (intent.type) {
    case 'track.add':
      return plan(document, 'Add track', (current) =>
        addTrack(current, intent.input, intent.index, idProvider),
      );
    case 'track.remove':
      return plan(document, 'Remove track', (current) => removeTrack(current, intent.trackId));
    case 'track.reorder':
      return plan(document, 'Reorder track', (current) =>
        reorderTrack(current, intent.trackId, intent.index),
      );
    case 'track.state.update':
      return plan(document, trackStateLabel(intent.patch), (current) =>
        updateTrackState(current, intent.trackId, intent.patch),
      );
    case 'clip.add':
      return plan(document, 'Add clip', (current) => addClip(current, intent.input, idProvider));
    case 'clip.remove': {
      const clipIds = [...new Set(intent.clipIds)];
      if (clipIds.length === 0) {
        return err(
          appError(
            'VALIDATION',
            'A remove-clips intent needs at least one clip id.',
            'Select one or more clips before deleting.',
          ),
        );
      }
      return createTimelineTransaction(document, {
        label: clipIds.length === 1 ? 'Remove clip' : 'Remove clips',
        operations: clipIds.map(
          (clipId): TimelineOperation =>
            (current) =>
              ok(removeClip(current, clipId)),
        ),
      });
    }
    case 'clip.move':
      return plan(document, 'Move clip', (current) =>
        moveClip(current, intent.clipId, intent.start, intent.trackId),
      );
    case 'clip.trim':
      return plan(document, 'Trim clip', (current) =>
        trimClip(current, intent.clipId, intent.edge, intent.time),
      );
    case 'clip.split':
      return plan(document, 'Split clip', (current) =>
        splitClip(current, intent.clipId, intent.time, idProvider),
      );
    case 'clip.properties.update':
      return plan(document, 'Update clip properties', (current) =>
        updateClipProperties(current, intent.clipId, intent.patch),
      );
    case 'clip.animation.set':
      return plan(document, 'Set clip animation', (current) =>
        setClipAnimation(current, intent.clipId, intent.animation),
      );
    case 'clip.audio.update':
      return plan(document, 'Update clip audio', (current) =>
        updateClipAudio(current, intent.clipId, intent.patch),
      );
    case 'transition.add':
      return plan(document, 'Add transition', (current) =>
        addTransition(current, intent.input, idProvider),
      );
    case 'transition.update':
      return plan(document, 'Update transition', (current) =>
        updateTransition(current, intent.transitionId, intent.patch),
      );
    case 'transition.remove':
      return plan(document, 'Remove transition', (current) =>
        ok(removeTransition(current, intent.transitionId)),
      );
  }
}

function validateUnlockedIntent(
  document: TimelineDocument,
  intent: TimelineEditIntent,
): Result<true> {
  if (intent.type === 'track.add' || intent.type === 'track.state.update') return ok(true);

  const tracks = tracksEditedByIntent(document, intent);
  const locked = tracks.find((track) => track.isLocked);
  if (!locked) return ok(true);
  return err(
    appError(
      'CONFLICT',
      `Track "${locked.label}" is locked.`,
      'Unlock the track before changing its content or position.',
    ),
  );
}

function tracksEditedByIntent(
  document: TimelineDocument,
  intent: Exclude<TimelineEditIntent, { readonly type: 'track.add' | 'track.state.update' }>,
): readonly Track[] {
  if (intent.type === 'track.remove' || intent.type === 'track.reorder') {
    return document.tracks.filter((track) => track.id === intent.trackId);
  }
  if (intent.type === 'clip.add') {
    return document.tracks.filter((track) => track.id === intent.input.trackId);
  }
  if (intent.type === 'clip.remove') {
    const ids = new Set(intent.clipIds);
    return document.tracks.filter((track) => track.clips.some((clip) => ids.has(clip.id)));
  }
  if (intent.type === 'clip.move') {
    const source = document.tracks.find((track) =>
      track.clips.some((clip) => clip.id === intent.clipId),
    );
    const target =
      intent.trackId === undefined
        ? source
        : document.tracks.find((track) => track.id === intent.trackId);
    return [...new Set([source, target].filter((track): track is Track => track !== undefined))];
  }
  if (
    intent.type === 'clip.trim' ||
    intent.type === 'clip.split' ||
    intent.type === 'clip.properties.update' ||
    intent.type === 'clip.animation.set' ||
    intent.type === 'clip.audio.update'
  ) {
    return document.tracks.filter((track) => track.clips.some((clip) => clip.id === intent.clipId));
  }
  const transition =
    intent.type === 'transition.add'
      ? document.transitions.find(
          (candidate) =>
            candidate.fromClipId === intent.input.fromClipId &&
            candidate.toClipId === intent.input.toClipId,
        )
      : document.transitions.find((candidate) => candidate.id === intent.transitionId);
  if (intent.type === 'transition.add' && !transition) {
    return document.tracks.filter((track) =>
      track.clips.some(
        (clip) => clip.id === intent.input.fromClipId || clip.id === intent.input.toClipId,
      ),
    );
  }
  return document.tracks.filter((track) => track.id === transition?.trackId);
}

function trackStateLabel(patch: UpdateTrackStateInput): string {
  if (patch.isLocked !== undefined) return patch.isLocked ? 'Lock track' : 'Unlock track';
  if (patch.isVisible !== undefined) return patch.isVisible ? 'Show track' : 'Hide track';
  return patch.isMuted ? 'Mute track' : 'Unmute track';
}

function plan(
  document: TimelineDocument,
  label: string,
  operation: TimelineOperation,
): Result<TimelineTransaction> {
  return createTimelineTransaction(document, { label, operations: [operation] });
}
