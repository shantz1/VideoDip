import {
  appError,
  err,
  normalized,
  ok,
  type AssetId,
  type ClipId,
  type Milliseconds,
  type Result,
  type TrackId,
} from '@videodip/shared';
import type {
  Clip,
  ClipAnimationProperty,
  ClipAudioSettings,
  ClipBlendMode,
  ClipMetadata,
  ClipKeyframe,
  ClipTransform,
  TimelineDocument,
  Track,
  TrackKind,
} from './document.types.js';

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

/** Creates a timeline from consumer-chosen tracks, preserving their order. */
export function createTimeline(tracks: readonly Track[] = []): TimelineDocument {
  return { tracks: [...tracks] };
}

/** Input for creating a track without exposing a mutable clip array. */
export interface CreateTrackInput {
  readonly id?: TrackId;
  readonly kind: TrackKind;
  readonly label: string;
}

/** Creates one empty generic track. Kind is metadata, not a closed enum. */
export function createTrack(input: CreateTrackInput): Track {
  return {
    id: input.id ?? (crypto.randomUUID() as TrackId),
    kind: input.kind,
    label: input.label,
    clips: [],
  };
}

/** Inserts an empty track at an explicit top-to-bottom visual position. */
export function addTrack(
  document: TimelineDocument,
  input: CreateTrackInput,
  index: number = document.tracks.length,
): Result<TimelineDocument> {
  const track = createTrack(input);
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
  return ok({ tracks: document.tracks.filter((candidate) => candidate.id !== trackId) });
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
  return ok({ tracks });
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
    tracks: document.tracks.map((track) => (track.id === trackId ? { ...track, clips } : track)),
  };
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
export function addClip(document: TimelineDocument, input: AddClipInput): Result<TimelineDocument> {
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
    id: crypto.randomUUID() as ClipId,
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

  return withTrackClips(
    document,
    track.id,
    track.clips.filter((c) => c.id !== clipId),
  );
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
    withTrackClips(
      document,
      track.id,
      [...siblings, trimmed].sort((a, b) => a.start - b.start),
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
    id: crypto.randomUUID() as ClipId,
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
  return ok(
    withTrackClips(
      document,
      track.id,
      [...rest, left, right].sort((a, b) => a.start - b.start),
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
