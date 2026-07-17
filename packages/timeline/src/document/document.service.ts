import {
  appError,
  err,
  ok,
  type AssetId,
  type ClipId,
  type Milliseconds,
  type Result,
  type TrackId,
} from '@videodip/shared';
import type { Clip, TimelineDocument, Track, TrackKind } from './document.types.js';

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
  };

  return ok(
    withTrackClips(
      document,
      track.id,
      [...track.clips, clip].sort((a, b) => a.start - b.start),
    ),
  );
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
    trimmed = { ...clip, duration: newDuration as Milliseconds };
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

  const left: Clip = { ...clip, duration: (atTime - clip.start) as Milliseconds };
  const right: Clip = {
    id: crypto.randomUUID() as ClipId,
    trackId: clip.trackId,
    assetId: clip.assetId,
    start: atTime,
    duration: (clipEnd - atTime) as Milliseconds,
    sourceStart: (clip.sourceStart + (atTime - clip.start)) as Milliseconds,
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
