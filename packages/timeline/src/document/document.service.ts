import {
  appError,
  err,
  normalized,
  ok,
  TIMELINE_SCHEMA_VERSION,
  type AssetId,
  type ClipId,
  type Milliseconds,
  type Result,
  type TrackId,
  type TransitionId,
} from '@videodip/shared';
import type {
  Clip,
  ClipAnimationProperty,
  ClipAudioSettings,
  ClipBlendMode,
  ClipMetadata,
  ClipKeyframe,
  ClipTransform,
  ClipTransition,
  CoreTransitionKind,
  TimelineDocument,
  Track,
  TrackKind,
  TransitionKind,
} from './document.types.js';
import { createRandomTimelineIdProvider } from '../identity/identity.service.js';
import type { TimelineIdProvider } from '../identity/identity.types.js';

/** Identity transform assigned to newly placed clips. */
export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  positionX: 0,
  positionY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

/** Visual defaults shared by project migration, preview and export adapters. */
export const DEFAULT_CLIP_VISUALS = {
  opacity: normalized(1),
  blendMode: 'normal' as ClipBlendMode,
  isEnabled: true,
};

/** Neutral audio mix assigned to new clips. */
export const DEFAULT_CLIP_AUDIO: ClipAudioSettings = {
  volume: normalized(1),
  isMuted: false,
  fadeIn: 0 as Milliseconds,
  fadeOut: 0 as Milliseconds,
};

/** Persisted defaults assigned to every newly created track. */
export const DEFAULT_TRACK_STATE = {
  isVisible: true,
  isMuted: false,
  isLocked: false,
} as const;

/** Built-in transition ids supported consistently by preview and FFmpeg export. */
export const CORE_TRANSITION_KINDS: readonly CoreTransitionKind[] = [
  'crossfade',
  'dip-to-black',
  'dip-to-white',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'zoom-in',
  'circle-open',
  'diagonal-top-left',
  'diagonal-bottom-right',
];

/** Creates a timeline from consumer-chosen tracks and transition relations. */
export function createTimeline(
  tracks: readonly Track[] = [],
  transitions: readonly ClipTransition[] = [],
): TimelineDocument {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    tracks: [...tracks],
    transitions: [...transitions],
  };
}

/**
 * Validates document-wide invariants that individual edit operations cannot prove alone.
 *
 * Persistence still validates unknown JSON at its boundary. This domain validation is the
 * single preflight for typed documents entering transactions, indexes, and project saves.
 */
export function validateTimeline(document: TimelineDocument): Result<TimelineDocument> {
  if (document.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
    return err(
      appError(
        'VALIDATION',
        `Timeline schema version ${document.schemaVersion} is not supported.`,
        `Migrate the timeline to schema version ${TIMELINE_SCHEMA_VERSION}.`,
      ),
    );
  }

  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  for (const track of document.tracks) {
    if (
      trackIds.has(track.id) ||
      !String(track.id).trim() ||
      !track.kind.trim() ||
      !track.label.trim() ||
      typeof track.isVisible !== 'boolean' ||
      typeof track.isMuted !== 'boolean' ||
      typeof track.isLocked !== 'boolean'
    ) {
      return err(
        appError(
          'VALIDATION',
          'Timeline tracks must have unique IDs, kinds, labels, and valid state flags.',
          'Repair or remove the invalid track before continuing.',
        ),
      );
    }
    trackIds.add(track.id);

    for (const clip of track.clips) {
      if (
        clipIds.has(clip.id) ||
        !String(clip.id).trim() ||
        !String(clip.assetId).trim() ||
        clip.trackId !== track.id
      ) {
        return err(
          appError(
            'VALIDATION',
            'Timeline clips must have unique IDs and belong to their containing track.',
            'Repair the clip identity or track reference before continuing.',
          ),
        );
      }
      clipIds.add(clip.id);
      if (
        !Number.isFinite(clip.start) ||
        clip.start < 0 ||
        !Number.isFinite(clip.duration) ||
        clip.duration <= 0 ||
        !Number.isFinite(clip.sourceStart) ||
        clip.sourceStart < 0
      ) {
        return err(
          appError(
            'VALIDATION',
            'Timeline clips must be ordered, non-overlapping, and have valid source ranges.',
            'Move or trim the conflicting clip before continuing.',
          ),
        );
      }
      const clipError = validateClipProperties(clip);
      if (clipError) return err(clipError);
    }
    const orderedClips = [...track.clips].sort((left, right) => left.start - right.start);
    for (const [clipIndex, clip] of orderedClips.entries()) {
      const previous = orderedClips[clipIndex - 1];
      if (previous && previous.start + previous.duration > clip.start) {
        return err(
          appError(
            'VALIDATION',
            'Timeline clips must be non-overlapping and have valid source ranges.',
            'Move or trim the conflicting clip before continuing.',
          ),
        );
      }
    }
  }

  const transitionIds = new Set<string>();
  for (const transition of document.transitions) {
    if (
      transitionIds.has(transition.id) ||
      !String(transition.id).trim() ||
      !trackIds.has(transition.trackId)
    ) {
      return err(
        appError(
          'VALIDATION',
          'Timeline transitions must have unique IDs and reference an existing track.',
          'Repair or remove the invalid transition before continuing.',
        ),
      );
    }
    transitionIds.add(transition.id);
    const transitionValidation = validateTransition(document, transition, transition.id);
    if (!transitionValidation.ok) return transitionValidation;
    const endpoints = findTransitionEndpoints(document, transition.fromClipId, transition.toClipId);
    if (!endpoints.ok) return endpoints;
    if (endpoints.value.track.id !== transition.trackId) {
      return err(
        appError(
          'VALIDATION',
          'A transition track must match the track containing both endpoint clips.',
          'Repair the transition track reference before continuing.',
        ),
      );
    }
  }

  return ok(document);
}

/** Input for creating a track without exposing a mutable clip array. */
export interface CreateTrackInput {
  readonly id?: TrackId;
  readonly kind: TrackKind;
  readonly label: string;
  readonly isVisible?: boolean;
  readonly isMuted?: boolean;
  readonly isLocked?: boolean;
}

/** Editable persisted track fields. At least one field must be supplied by callers. */
export interface UpdateTrackStateInput {
  readonly isVisible?: boolean;
  readonly isMuted?: boolean;
  readonly isLocked?: boolean;
}

/** Creates one empty generic track. Kind is metadata, not a closed enum. */
export function createTrack(
  input: CreateTrackInput,
  idProvider: TimelineIdProvider = createRandomTimelineIdProvider(),
): Track {
  return {
    id: input.id ?? idProvider.nextTrackId(),
    kind: input.kind,
    label: input.label,
    isVisible: input.isVisible ?? DEFAULT_TRACK_STATE.isVisible,
    isMuted: input.isMuted ?? DEFAULT_TRACK_STATE.isMuted,
    isLocked: input.isLocked ?? DEFAULT_TRACK_STATE.isLocked,
    clips: [],
  };
}

/** Updates persisted track state without changing clip content or ordering. */
export function updateTrackState(
  document: TimelineDocument,
  trackId: TrackId,
  patch: UpdateTrackStateInput,
): Result<TimelineDocument> {
  const track = document.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    return err(appError('NOT_FOUND', `No track with id "${trackId}".`, 'Refresh the timeline.'));
  }
  if (
    patch.isVisible === undefined &&
    patch.isMuted === undefined &&
    patch.isLocked === undefined
  ) {
    return err(
      appError(
        'VALIDATION',
        'A track-state edit must change visibility, mute, or lock state.',
        'Choose a track control before applying the edit.',
      ),
    );
  }
  const updated: Track = { ...track, ...patch };
  if (
    updated.isVisible === track.isVisible &&
    updated.isMuted === track.isMuted &&
    updated.isLocked === track.isLocked
  ) {
    return ok(document);
  }
  return ok({
    ...document,
    tracks: document.tracks.map((candidate) => (candidate.id === trackId ? updated : candidate)),
  });
}

/** Inserts an empty track at an explicit top-to-bottom visual position. */
export function addTrack(
  document: TimelineDocument,
  input: CreateTrackInput,
  index: number = document.tracks.length,
  idProvider: TimelineIdProvider = createRandomTimelineIdProvider(),
): Result<TimelineDocument> {
  const track = createTrack(input, idProvider);
  if (document.tracks.some((existing) => existing.id === track.id)) {
    return err(
      appError(
        'CONFLICT',
        `A track with id "${track.id}" already exists.`,
        'Choose a unique track id.',
      ),
    );
  }
  if (!String(track.id).trim() || !track.kind.trim() || !track.label.trim()) {
    return err(
      appError(
        'VALIDATION',
        'Track kind and label must not be empty.',
        'Provide a kind and visible label for the track.',
      ),
    );
  }
  if (!Number.isInteger(index) || index < 0 || index > document.tracks.length) {
    return err(
      appError(
        'VALIDATION',
        `Track position ${index} is outside the timeline.`,
        'Choose a position between zero and the current track count.',
      ),
    );
  }

  return ok({
    ...document,
    tracks: [...document.tracks.slice(0, index), track, ...document.tracks.slice(index)],
  });
}

/** Removes an empty track, refusing to discard clips implicitly. */
export function removeTrack(
  document: TimelineDocument,
  trackId: TrackId,
): Result<TimelineDocument> {
  const track = document.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    return err(appError('NOT_FOUND', `No track with id "${trackId}".`, 'Refresh the timeline.'));
  }
  if (track.clips.length > 0) {
    return err(
      appError(
        'CONFLICT',
        'A track containing clips cannot be removed.',
        'Move or delete the track clips first, then remove the track.',
      ),
    );
  }
  return ok({
    ...document,
    tracks: document.tracks.filter((candidate) => candidate.id !== trackId),
  });
}

/** Moves a track to a new top-to-bottom visual index. */
export function reorderTrack(
  document: TimelineDocument,
  trackId: TrackId,
  index: number,
): Result<TimelineDocument> {
  const currentIndex = document.tracks.findIndex((track) => track.id === trackId);
  if (currentIndex < 0) {
    return err(appError('NOT_FOUND', `No track with id "${trackId}".`, 'Refresh the timeline.'));
  }
  if (!Number.isInteger(index) || index < 0 || index >= document.tracks.length) {
    return err(
      appError(
        'VALIDATION',
        `Track position ${index} is outside the timeline.`,
        'Choose an existing track position.',
      ),
    );
  }

  const tracks = [...document.tracks];
  const [track] = tracks.splice(currentIndex, 1);
  if (!track) {
    return err(appError('NOT_FOUND', `No track with id "${trackId}".`, 'Refresh the timeline.'));
  }
  tracks.splice(index, 0, track);
  return ok({ ...document, tracks });
}

/** The project's total duration: the far edge of its last clip, or zero. */
export function getDuration(document: TimelineDocument): Milliseconds {
  let end = 0;
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clip.duration);
    }
  }
  return end as Milliseconds;
}

/** Whether two time spans overlap. Touching edges (`aEnd === bStart`) do not count. */
function spansOverlap(
  a: { readonly start: Milliseconds; readonly duration: Milliseconds },
  b: { readonly start: Milliseconds; readonly duration: Milliseconds },
): boolean {
  const aEnd = a.start + a.duration;
  const bEnd = b.start + b.duration;
  return a.start < bEnd && b.start < aEnd;
}

/** Locates a clip and the index of its track. `undefined` if not present. */
function findClip(
  document: TimelineDocument,
  clipId: ClipId,
): { readonly clip: Clip; readonly trackIndex: number } | undefined {
  for (let trackIndex = 0; trackIndex < document.tracks.length; trackIndex++) {
    const clip = document.tracks[trackIndex]?.clips.find((c) => c.id === clipId);
    if (clip) return { clip, trackIndex };
  }
  return undefined;
}

/** Returns a new document with one track's clip list replaced. */
function withTrackClips(
  document: TimelineDocument,
  trackId: TrackId,
  clips: readonly Clip[],
): TimelineDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => (track.id === trackId ? { ...track, clips } : track)),
  };
}

/** Input for joining an ordered, touching pair of clips. */
export interface AddTransitionInput {
  readonly id?: TransitionId;
  readonly fromClipId: ClipId;
  readonly toClipId: ClipId;
  readonly kind: TransitionKind;
  readonly duration: Milliseconds;
  readonly parameters?: ClipMetadata;
}

/** Editable transition fields; endpoint identity is deliberately immutable. */
export interface UpdateTransitionInput {
  readonly kind?: TransitionKind;
  readonly duration?: Milliseconds;
  readonly parameters?: ClipMetadata;
}

/** Adds an explicit effect relation at the cut between two adjacent clips. */
export function addTransition(
  document: TimelineDocument,
  input: AddTransitionInput,
  idProvider: TimelineIdProvider = createRandomTimelineIdProvider(),
): Result<TimelineDocument> {
  const endpoints = findTransitionEndpoints(document, input.fromClipId, input.toClipId);
  if (!endpoints.ok) return endpoints;
  const transition: ClipTransition = {
    id: input.id ?? idProvider.nextTransitionId(),
    trackId: endpoints.value.track.id,
    fromClipId: input.fromClipId,
    toClipId: input.toClipId,
    kind: input.kind,
    duration: input.duration,
    parameters: { ...(input.parameters ?? {}) },
  };
  const validation = validateTransition(document, transition);
  if (!validation.ok) return validation;
  return ok({ ...document, transitions: [...document.transitions, transition] });
}

/** Updates transition presentation while preserving its cut endpoints. */
export function updateTransition(
  document: TimelineDocument,
  transitionId: TransitionId,
  patch: UpdateTransitionInput,
): Result<TimelineDocument> {
  const transition = document.transitions.find((candidate) => candidate.id === transitionId);
  if (!transition) {
    return err(
      appError('NOT_FOUND', `No transition with id "${transitionId}".`, 'Reload the timeline.'),
    );
  }
  const updated: ClipTransition = {
    ...transition,
    ...(patch.kind === undefined ? {} : { kind: patch.kind }),
    ...(patch.duration === undefined ? {} : { duration: patch.duration }),
    parameters: { ...transition.parameters, ...patch.parameters },
  };
  const validation = validateTransition(document, updated, transitionId);
  if (!validation.ok) return validation;
  return ok({
    ...document,
    transitions: document.transitions.map((candidate) =>
      candidate.id === transitionId ? updated : candidate,
    ),
  });
}

/** Removes a transition. Already-removed ids are a safe no-op. */
export function removeTransition(
  document: TimelineDocument,
  transitionId: TransitionId,
): TimelineDocument {
  if (!document.transitions.some((transition) => transition.id === transitionId)) return document;
  return {
    ...document,
    transitions: document.transitions.filter((transition) => transition.id !== transitionId),
  };
}

function findTransitionEndpoints(
  document: TimelineDocument,
  fromClipId: ClipId,
  toClipId: ClipId,
): Result<{ readonly track: Track; readonly from: Clip; readonly to: Clip }> {
  const from = findClip(document, fromClipId);
  const to = findClip(document, toClipId);
  if (!from || !to) {
    return err(
      appError(
        'NOT_FOUND',
        'A transition endpoint clip no longer exists.',
        'Choose two clips that are still on the timeline.',
      ),
    );
  }
  if (from.clip.trackId !== to.clip.trackId) {
    return err(
      appError(
        'VALIDATION',
        'A transition must join clips on the same track.',
        'Move both clips onto one track before adding the transition.',
      ),
    );
  }
  const track = document.tracks[from.trackIndex];
  if (!track) {
    return err(appError('NOT_FOUND', 'The transition track disappeared.', 'Reload the timeline.'));
  }
  const ordered = [...track.clips].sort((left, right) => left.start - right.start);
  const fromIndex = ordered.findIndex((clip) => clip.id === fromClipId);
  const next = ordered[fromIndex + 1];
  if (
    fromIndex < 0 ||
    next?.id !== toClipId ||
    from.clip.start + from.clip.duration !== to.clip.start
  ) {
    return err(
      appError(
        'CONFLICT',
        'Transitions require two adjacent clips with no timeline gap.',
        'Move the clips until their edges touch, then add the transition.',
      ),
    );
  }
  return ok({ track, from: from.clip, to: to.clip });
}

function validateTransition(
  document: TimelineDocument,
  transition: ClipTransition,
  replacingId?: TransitionId,
): Result<TimelineDocument> {
  const endpoints = findTransitionEndpoints(document, transition.fromClipId, transition.toClipId);
  if (!endpoints.ok) return endpoints;
  const maximumDuration = Math.min(endpoints.value.from.duration, endpoints.value.to.duration);
  if (
    !transition.kind.trim() ||
    transition.kind.length > 128 ||
    !Number.isFinite(transition.duration) ||
    transition.duration <= 0 ||
    transition.duration > maximumDuration
  ) {
    return err(
      appError(
        'VALIDATION',
        'Transition kind or duration is invalid for these clips.',
        `Choose a named transition no longer than ${maximumDuration / 1000} seconds.`,
      ),
    );
  }
  const parameterEntries = Object.entries(transition.parameters);
  if (
    parameterEntries.length > 64 ||
    parameterEntries.some(
      ([key, value]) =>
        !key.trim() || key.length > 128 || (typeof value === 'number' && !Number.isFinite(value)),
    )
  ) {
    return err(
      appError(
        'VALIDATION',
        'Transition parameters contain invalid plugin data.',
        'Use at most 64 short keys with finite primitive values.',
      ),
    );
  }
  if (
    document.transitions.some(
      (candidate) =>
        candidate.id !== replacingId &&
        (candidate.id === transition.id ||
          (candidate.fromClipId === transition.fromClipId &&
            candidate.toClipId === transition.toClipId)),
    )
  ) {
    return err(
      appError(
        'CONFLICT',
        'That cut already has a transition or duplicate transition id.',
        'Edit the existing transition instead of adding another.',
      ),
    );
  }
  return ok(document);
}

/** Drops dangling relations and clamps duration after clip timing edits. */
function reconcileTransitions(document: TimelineDocument): TimelineDocument {
  const transitions: ClipTransition[] = [];
  for (const transition of document.transitions) {
    const endpoints = findTransitionEndpoints(document, transition.fromClipId, transition.toClipId);
    if (!endpoints.ok) continue;
    const maximumDuration = Math.min(endpoints.value.from.duration, endpoints.value.to.duration);
    transitions.push({
      ...transition,
      trackId: endpoints.value.track.id,
      duration: Math.min(transition.duration, maximumDuration) as Milliseconds,
    });
  }
  return { ...document, transitions };
}

export interface AddClipInput {
  readonly trackId: TrackId;
  readonly assetId: AssetId;
  readonly start: Milliseconds;
  readonly duration: Milliseconds;
  /** Offset into the source media. Defaults to the start of the source. */
  readonly sourceStart?: Milliseconds;
  readonly transform?: Partial<ClipTransform>;
  readonly opacity?: Clip['opacity'];
  readonly blendMode?: ClipBlendMode;
  readonly isEnabled?: boolean;
  readonly metadata?: ClipMetadata;
  readonly animation?: readonly ClipKeyframe[];
  readonly audio?: Partial<ClipAudioSettings>;
}

/** Undoable patch for static clip visuals and plugin-safe metadata. */
export interface UpdateClipPropertiesInput {
  readonly transform?: Partial<ClipTransform>;
  readonly opacity?: Clip['opacity'];
  readonly blendMode?: ClipBlendMode;
  readonly isEnabled?: boolean;
  /** Metadata keys are merged; `null` is a value rather than deletion. */
  readonly metadata?: ClipMetadata;
}

/**
 * Places a new clip on a track.
 *
 * Fails with `CONFLICT` rather than silently reordering or bumping existing
 * clips — an editor that moves a creator's other clips as a side effect of an
 * unrelated action is a worse failure mode than an explicit rejection.
 */
export function addClip(
  document: TimelineDocument,
  input: AddClipInput,
  idProvider: TimelineIdProvider = createRandomTimelineIdProvider(),
): Result<TimelineDocument> {
  const sourceStart = input.sourceStart ?? (0 as Milliseconds);
  if (
    !Number.isFinite(input.start) ||
    input.start < 0 ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    !Number.isFinite(sourceStart) ||
    sourceStart < 0
  ) {
    return err(
      appError(
        'VALIDATION',
        'Clip timing must be finite, start at or after zero, and have positive duration.',
        'Choose a valid timeline position and source range.',
      ),
    );
  }
  const track = document.tracks.find((t) => t.id === input.trackId);
  if (!track) {
    return err(
      appError('NOT_FOUND', `No track with id "${input.trackId}".`, 'Choose an existing track.'),
    );
  }

  const candidate = { start: input.start, duration: input.duration };
  if (track.clips.some((existing) => spansOverlap(existing, candidate))) {
    return err(
      appError(
        'CONFLICT',
        'The new clip overlaps an existing clip on this track.',
        'Move the playhead past the existing clip, or place it on a different track.',
      ),
    );
  }

  const clip: Clip = {
    id: idProvider.nextClipId(),
    trackId: input.trackId,
    assetId: input.assetId,
    start: input.start,
    duration: input.duration,
    sourceStart,
    transform: { ...DEFAULT_CLIP_TRANSFORM, ...input.transform },
    opacity: input.opacity ?? DEFAULT_CLIP_VISUALS.opacity,
    blendMode: input.blendMode ?? DEFAULT_CLIP_VISUALS.blendMode,
    isEnabled: input.isEnabled ?? DEFAULT_CLIP_VISUALS.isEnabled,
    metadata: { ...(input.metadata ?? {}) },
    animation: sortKeyframes(input.animation ?? []),
    audio: { ...DEFAULT_CLIP_AUDIO, ...input.audio },
  };
  const visualError = validateClipProperties(clip);
  if (visualError) return err(visualError);

  return ok(
    withTrackClips(
      document,
      track.id,
      [...track.clips, clip].sort((a, b) => a.start - b.start),
    ),
  );
}

/** Updates volume/mute/fades as one undoable audio-domain edit. */
export function updateClipAudio(
  document: TimelineDocument,
  clipId: ClipId,
  patch: Partial<ClipAudioSettings>,
): Result<TimelineDocument> {
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }
  const track = document.tracks[found.trackIndex];
  if (!track) {
    return err(
      appError('NOT_FOUND', 'Clip track disappeared mid-operation.', 'Reload the project.'),
    );
  }
  const updated: Clip = { ...found.clip, audio: { ...found.clip.audio, ...patch } };
  const visualError = validateClipProperties(updated);
  if (visualError) return err(visualError);
  return ok(
    withTrackClips(
      document,
      track.id,
      track.clips.map((clip) => (clip.id === clipId ? updated : clip)),
    ),
  );
}

/** Replaces a clip's keyframes after validating offsets, values and uniqueness. */
export function setClipAnimation(
  document: TimelineDocument,
  clipId: ClipId,
  animation: readonly ClipKeyframe[],
): Result<TimelineDocument> {
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }
  const track = document.tracks[found.trackIndex];
  if (!track) {
    return err(
      appError('NOT_FOUND', 'Clip track disappeared mid-operation.', 'Reload the project.'),
    );
  }
  const updated: Clip = { ...found.clip, animation: sortKeyframes(animation) };
  const visualError = validateClipProperties(updated);
  if (visualError) return err(visualError);
  return ok(
    withTrackClips(
      document,
      track.id,
      track.clips.map((clip) => (clip.id === clipId ? updated : clip)),
    ),
  );
}

/** Evaluates one animated property at a clip-relative offset. */
export function evaluateClipProperty(
  clip: Clip,
  property: ClipAnimationProperty,
  offset: Milliseconds,
): number {
  const keyframes = clip.animation.filter((keyframe) => keyframe.property === property);
  if (keyframes.length === 0) return basePropertyValue(clip, property);
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (!first || !last) return basePropertyValue(clip, property);
  if (offset <= first.offset) return first.value;
  if (offset >= last.offset) return last.value;
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    const left = keyframes[index - 1];
    if (!left || !right || offset > right.offset) continue;
    const progress = (offset - left.offset) / (right.offset - left.offset);
    return left.value + (right.value - left.value) * applyEasing(progress, right.easing);
  }
  return last.value;
}

/** Updates static visuals/metadata without changing clip timing or identity. */
export function updateClipProperties(
  document: TimelineDocument,
  clipId: ClipId,
  patch: UpdateClipPropertiesInput,
): Result<TimelineDocument> {
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }
  const track = document.tracks[found.trackIndex];
  if (!track) {
    return err(
      appError('NOT_FOUND', 'Clip track disappeared mid-operation.', 'Reload the project.'),
    );
  }
  const updated: Clip = {
    ...found.clip,
    ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
    ...(patch.blendMode === undefined ? {} : { blendMode: patch.blendMode }),
    ...(patch.isEnabled === undefined ? {} : { isEnabled: patch.isEnabled }),
    transform: { ...found.clip.transform, ...patch.transform },
    metadata: { ...found.clip.metadata, ...patch.metadata },
  };
  const visualError = validateClipProperties(updated);
  if (visualError) return err(visualError);
  return ok(
    withTrackClips(
      document,
      track.id,
      track.clips.map((clip) => (clip.id === clipId ? updated : clip)),
    ),
  );
}

function validateClipProperties(clip: Clip) {
  const transformValues = Object.values(clip.transform);
  if (
    transformValues.some((value) => !Number.isFinite(value)) ||
    clip.transform.scaleX <= 0 ||
    clip.transform.scaleY <= 0 ||
    clip.transform.scaleX > 100 ||
    clip.transform.scaleY > 100 ||
    Math.abs(clip.transform.positionX) > 10 ||
    Math.abs(clip.transform.positionY) > 10 ||
    Math.abs(clip.transform.rotation) > 36_000 ||
    !Number.isFinite(clip.opacity) ||
    clip.opacity < 0 ||
    clip.opacity > 1
  ) {
    return appError(
      'VALIDATION',
      'Clip transform or opacity is outside the supported range.',
      'Use finite positions, positive scales, and opacity between zero and one.',
    );
  }
  if (!['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(clip.blendMode)) {
    return appError('VALIDATION', 'Clip blend mode is unsupported.', 'Choose a listed blend mode.');
  }
  const entries = Object.entries(clip.metadata);
  if (
    entries.length > 64 ||
    entries.some(
      ([key, value]) =>
        !key.trim() || key.length > 128 || (typeof value === 'number' && !Number.isFinite(value)),
    )
  ) {
    return appError(
      'VALIDATION',
      'Clip metadata is too large or contains an invalid key/value.',
      'Use at most 64 short keys and finite primitive values.',
    );
  }
  const keys = new Set<string>();
  for (const keyframe of clip.animation) {
    const key = `${keyframe.property}:${keyframe.offset}`;
    if (
      keys.has(key) ||
      !Number.isFinite(keyframe.offset) ||
      keyframe.offset < 0 ||
      keyframe.offset > clip.duration ||
      !isValidAnimatedValue(keyframe.property, keyframe.value) ||
      !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(keyframe.easing)
    ) {
      return appError(
        'VALIDATION',
        'Clip animation contains an invalid or duplicate keyframe.',
        'Keep keyframes inside the clip with valid property values and unique offsets.',
      );
    }
    keys.add(key);
  }
  if (
    !Number.isFinite(clip.audio.volume) ||
    clip.audio.volume < 0 ||
    clip.audio.volume > 1 ||
    !Number.isFinite(clip.audio.fadeIn) ||
    !Number.isFinite(clip.audio.fadeOut) ||
    clip.audio.fadeIn < 0 ||
    clip.audio.fadeOut < 0 ||
    clip.audio.fadeIn > clip.duration ||
    clip.audio.fadeOut > clip.duration
  ) {
    return appError(
      'VALIDATION',
      'Clip audio volume or fades are outside the supported range.',
      'Use volume from zero to one and keep fades within the clip duration.',
    );
  }
  return undefined;
}

function sortKeyframes(keyframes: readonly ClipKeyframe[]): readonly ClipKeyframe[] {
  return [...keyframes].sort(
    (left, right) => left.property.localeCompare(right.property) || left.offset - right.offset,
  );
}

function basePropertyValue(clip: Clip, property: ClipAnimationProperty): number {
  return property === 'opacity' ? clip.opacity : clip.transform[property];
}

function isValidAnimatedValue(property: ClipAnimationProperty, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (property === 'opacity') return value >= 0 && value <= 1;
  if (property === 'scaleX' || property === 'scaleY') return value > 0 && value <= 100;
  if (property === 'positionX' || property === 'positionY') return Math.abs(value) <= 10;
  return Math.abs(value) <= 36_000;
}

function applyEasing(progress: number, easing: ClipKeyframe['easing']): number {
  if (easing === 'ease-in') return progress * progress;
  if (easing === 'ease-out') return 1 - (1 - progress) * (1 - progress);
  if (easing === 'ease-in-out') {
    return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
  }
  return progress;
}

/**
 * Finds the earliest position at or after `preferredStart` where a clip of
 * `duration` fits on the track without overlapping.
 *
 * Exists so "add to timeline" can always succeed: {@link addClip} deliberately
 * rejects overlaps rather than resolving them, so callers that want
 * place-near-the-playhead semantics resolve the position with this first.
 * Tracks are unbounded to the right, so a fit always exists — the only
 * failure is an unknown track.
 */
export function findFreeStart(
  document: TimelineDocument,
  trackId: TrackId,
  preferredStart: Milliseconds,
  duration: Milliseconds,
): Result<Milliseconds> {
  if (
    !Number.isFinite(preferredStart) ||
    preferredStart < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return err(
      appError(
        'VALIDATION',
        'Placement timing must be finite, non-negative, and have positive duration.',
        'Choose a valid timeline position and clip duration.',
      ),
    );
  }
  const track = document.tracks.find((t) => t.id === trackId);
  if (!track) {
    return err(
      appError('NOT_FOUND', `No track with id "${trackId}".`, 'Choose an existing track.'),
    );
  }

  // One forward pass over the clips in start order: every time the candidate
  // span collides, jump to the far edge of the blocking clip and keep going.
  const sorted = [...track.clips].sort((a, b) => a.start - b.start);
  let candidate = preferredStart;
  for (const clip of sorted) {
    if (spansOverlap(clip, { start: candidate, duration })) {
      candidate = (clip.start + clip.duration) as Milliseconds;
    }
  }
  return ok(candidate);
}

/** Removes a clip. A no-op, not an error, if the id is already gone. */
export function removeClip(document: TimelineDocument, clipId: ClipId): TimelineDocument {
  const found = findClip(document, clipId);
  if (!found) return document;

  const track = document.tracks[found.trackIndex];
  if (!track) return document;

  const withoutClip = withTrackClips(
    document,
    track.id,
    track.clips.filter((c) => c.id !== clipId),
  );
  return {
    ...withoutClip,
    transitions: withoutClip.transitions.filter(
      (transition) => transition.fromClipId !== clipId && transition.toClipId !== clipId,
    ),
  };
}

/**
 * Moves a clip to a new position, optionally onto a different track.
 *
 * Fails with `CONFLICT` on overlap with any other clip already on the target
 * track — the clip being moved is excluded from that check against itself.
 */
export function moveClip(
  document: TimelineDocument,
  clipId: ClipId,
  newStart: Milliseconds,
  newTrackId?: TrackId,
): Result<TimelineDocument> {
  if (!Number.isFinite(newStart) || newStart < 0) {
    return err(
      appError(
        'VALIDATION',
        'A clip cannot move before the timeline start or to a non-finite time.',
        'Choose a position at or after zero.',
      ),
    );
  }
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }

  const targetTrackId = newTrackId ?? found.clip.trackId;
  const targetTrack = document.tracks.find((t) => t.id === targetTrackId);
  if (!targetTrack) {
    return err(
      appError('NOT_FOUND', `No track with id "${targetTrackId}".`, 'Choose an existing track.'),
    );
  }

  const moved: Clip = { ...found.clip, start: newStart, trackId: targetTrackId };
  const siblings = targetTrack.clips.filter((c) => c.id !== clipId);
  if (siblings.some((existing) => spansOverlap(existing, moved))) {
    return err(
      appError(
        'CONFLICT',
        'That position overlaps another clip on the target track.',
        'Choose a position that does not overlap an existing clip.',
      ),
    );
  }

  const withoutOld = removeClip(document, clipId);
  return ok(
    withTrackClips(
      withoutOld,
      targetTrackId,
      [...targetTrack.clips.filter((c) => c.id !== clipId), moved].sort(
        (a, b) => a.start - b.start,
      ),
    ),
  );
}

/** Which edge of a clip {@link trimClip} adjusts. */
export type TrimEdge = 'start' | 'end';

/**
 * Adjusts one edge of a clip, keeping the other edge fixed.
 *
 * Trimming the start edge shifts `sourceStart` forward by the same amount the
 * timeline start moves — the clip reveals less of its source, not a shifted
 * window of it. Fails with `VALIDATION` if the result would have zero or
 * negative duration, or a negative `sourceStart`.
 */
export function trimClip(
  document: TimelineDocument,
  clipId: ClipId,
  edge: TrimEdge,
  newTime: Milliseconds,
): Result<TimelineDocument> {
  if (!Number.isFinite(newTime) || newTime < 0) {
    return err(
      appError(
        'VALIDATION',
        'A trim point must be a finite time at or after zero.',
        'Choose a valid point on the timeline.',
      ),
    );
  }
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }
  const { clip } = found;
  const track = document.tracks[found.trackIndex];
  if (!track) {
    return err(
      appError('NOT_FOUND', 'Clip track disappeared mid-operation.', 'Reload the project.'),
    );
  }

  const clipEnd = clip.start + clip.duration;
  let trimmed: Clip;

  if (edge === 'start') {
    const newDuration = clipEnd - newTime;
    const sourceDelta = newTime - clip.start;
    if (newDuration <= 0) {
      return err(
        appError(
          'VALIDATION',
          'Trimming past the end of the clip.',
          'Trim to a point before the clip ends.',
        ),
      );
    }
    if (clip.sourceStart + sourceDelta < 0) {
      return err(
        appError(
          'VALIDATION',
          'Trimming before the start of the source.',
          'The source has no earlier frames to reveal.',
        ),
      );
    }
    trimmed = {
      ...clip,
      start: newTime,
      duration: newDuration as Milliseconds,
      sourceStart: (clip.sourceStart + sourceDelta) as Milliseconds,
      animation:
        sourceDelta >= 0
          ? sliceClipAnimation(clip, sourceDelta as Milliseconds, clip.duration)
          : clip.animation.map((keyframe) => ({
              ...keyframe,
              offset: (keyframe.offset - sourceDelta) as Milliseconds,
            })),
      audio: {
        ...clip.audio,
        fadeIn: Math.min(clip.audio.fadeIn, newDuration) as Milliseconds,
        fadeOut: Math.min(clip.audio.fadeOut, newDuration) as Milliseconds,
      },
    };
  } else {
    const newDuration = newTime - clip.start;
    if (newDuration <= 0) {
      return err(
        appError(
          'VALIDATION',
          'Trimming before the start of the clip.',
          'Trim to a point after the clip starts.',
        ),
      );
    }
    trimmed = {
      ...clip,
      duration: newDuration as Milliseconds,
      animation:
        newDuration < clip.duration
          ? sliceClipAnimation(clip, 0 as Milliseconds, newDuration as Milliseconds)
          : clip.animation,
      audio: {
        ...clip.audio,
        fadeIn: Math.min(clip.audio.fadeIn, newDuration) as Milliseconds,
        fadeOut: Math.min(clip.audio.fadeOut, newDuration) as Milliseconds,
      },
    };
  }

  const siblings = track.clips.filter((c) => c.id !== clipId);
  if (siblings.some((existing) => spansOverlap(existing, trimmed))) {
    return err(
      appError(
        'CONFLICT',
        'The trimmed clip would overlap a neighbour.',
        'Trim by a smaller amount.',
      ),
    );
  }

  return ok(
    reconcileTransitions(
      withTrackClips(
        document,
        track.id,
        [...siblings, trimmed].sort((a, b) => a.start - b.start),
      ),
    ),
  );
}

/**
 * Splits a clip into two at `atTime`, both referencing the same source asset.
 *
 * `atTime` must fall strictly inside the clip's span — splitting exactly at
 * an edge would just produce one empty piece, which is not a split.
 */
export function splitClip(
  document: TimelineDocument,
  clipId: ClipId,
  atTime: Milliseconds,
  idProvider: TimelineIdProvider = createRandomTimelineIdProvider(),
): Result<TimelineDocument> {
  if (!Number.isFinite(atTime) || atTime < 0) {
    return err(
      appError(
        'VALIDATION',
        'A split point must be a finite time at or after zero.',
        'Choose a valid point inside the clip.',
      ),
    );
  }
  const found = findClip(document, clipId);
  if (!found) {
    return err(appError('NOT_FOUND', `No clip with id "${clipId}".`, 'Reload the project.'));
  }
  const { clip } = found;
  const track = document.tracks[found.trackIndex];
  if (!track) {
    return err(
      appError('NOT_FOUND', 'Clip track disappeared mid-operation.', 'Reload the project.'),
    );
  }

  const clipEnd = clip.start + clip.duration;
  if (atTime <= clip.start || atTime >= clipEnd) {
    return err(
      appError(
        'VALIDATION',
        'Split point must fall strictly inside the clip.',
        'Move the playhead into the middle of the clip before splitting.',
      ),
    );
  }

  const splitOffset = (atTime - clip.start) as Milliseconds;
  const left: Clip = {
    ...clip,
    duration: splitOffset,
    animation: sliceClipAnimation(clip, 0 as Milliseconds, splitOffset),
    audio: {
      ...clip.audio,
      fadeIn: Math.min(clip.audio.fadeIn, splitOffset) as Milliseconds,
      fadeOut: 0 as Milliseconds,
    },
  };
  const right: Clip = {
    ...clip,
    id: idProvider.nextClipId(),
    start: atTime,
    duration: (clipEnd - atTime) as Milliseconds,
    sourceStart: (clip.sourceStart + (atTime - clip.start)) as Milliseconds,
    animation: sliceClipAnimation(clip, splitOffset, clip.duration),
    audio: {
      ...clip.audio,
      fadeIn: 0 as Milliseconds,
      fadeOut: Math.min(clip.audio.fadeOut, clip.duration - splitOffset) as Milliseconds,
    },
  };

  const rest = track.clips.filter((c) => c.id !== clipId);
  const withRemappedOutgoingTransition: TimelineDocument = {
    ...document,
    transitions: document.transitions.map((transition) =>
      transition.fromClipId === clipId ? { ...transition, fromClipId: right.id } : transition,
    ),
  };
  return ok(
    reconcileTransitions(
      withTrackClips(
        withRemappedOutgoingTransition,
        track.id,
        [...rest, left, right].sort((a, b) => a.start - b.start),
      ),
    ),
  );
}

function sliceClipAnimation(
  clip: Clip,
  from: Milliseconds,
  to: Milliseconds,
): readonly ClipKeyframe[] {
  const properties = new Set(clip.animation.map((keyframe) => keyframe.property));
  const sliced: ClipKeyframe[] = [];
  for (const property of properties) {
    const inner = clip.animation
      .filter(
        (keyframe) =>
          keyframe.property === property && keyframe.offset > from && keyframe.offset < to,
      )
      .map((keyframe) => ({
        ...keyframe,
        offset: (keyframe.offset - from) as Milliseconds,
      }));
    sliced.push(
      {
        property,
        offset: 0 as Milliseconds,
        value: evaluateClipProperty(clip, property, from),
        easing: 'linear',
      },
      ...inner,
      {
        property,
        offset: (to - from) as Milliseconds,
        value: evaluateClipProperty(clip, property, to),
        easing: inner.at(-1)?.easing ?? 'linear',
      },
    );
  }
  return sortKeyframes(sliced);
}
