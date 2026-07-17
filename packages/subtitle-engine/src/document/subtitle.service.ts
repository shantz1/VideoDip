import {
  appError,
  err,
  normalized,
  ok,
  type Milliseconds,
  type Result,
  type SegmentId,
} from '@videodip/shared';
import type {
  AddSubtitleSegmentInput,
  SubtitleDocument,
  SubtitleSegment,
  SubtitleStyle,
  SubtitleWord,
} from './subtitle.types.js';

/** Neutral subtitle style; rendering templates may override every nullable field. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: null,
  fontSize: null,
  foreground: null,
  background: null,
  isBold: false,
  isItalic: false,
  isUnderlined: false,
  alignment: 'center',
  positionX: normalized(0.5),
  positionY: normalized(0.88),
  animation: 'fade',
};

/** Creates an empty language-aware subtitle document. */
export function createSubtitleDocument(language: string | null = null): SubtitleDocument {
  return { version: 1, language, segments: [], defaultStyle: DEFAULT_SUBTITLE_STYLE };
}

/** Inserts a validated cue while preserving chronological order. */
export function addSubtitleSegment(
  document: SubtitleDocument,
  input: AddSubtitleSegmentInput,
): Result<SubtitleDocument> {
  const segment: SubtitleSegment = {
    id: input.id ?? (crypto.randomUUID() as SegmentId),
    start: input.start,
    end: input.end,
    text: input.text.trim(),
    words: [...(input.words ?? [])],
    style: { ...(input.style ?? {}) },
    speaker: input.speaker?.trim() || null,
  };
  const error = validateSegment(segment);
  if (error) return err(error);
  if (document.segments.some((existing) => existing.id === segment.id)) {
    return err(appError('CONFLICT', 'Subtitle segment id already exists.', 'Create a new cue id.'));
  }
  if (document.segments.some((existing) => overlaps(existing, segment))) {
    return err(
      appError(
        'CONFLICT',
        'Subtitle timing overlaps an existing cue.',
        'Move or shorten the cue so only one subtitle is active at a time.',
      ),
    );
  }
  return ok({
    ...document,
    segments: [...document.segments, segment].sort((left, right) => left.start - right.start),
  });
}

/** Applies an immutable cue patch with timing and word-boundary validation. */
export function updateSubtitleSegment(
  document: SubtitleDocument,
  segmentId: SegmentId,
  patch: Partial<Omit<SubtitleSegment, 'id'>>,
): Result<SubtitleDocument> {
  const current = document.segments.find((segment) => segment.id === segmentId);
  if (!current) {
    return err(appError('NOT_FOUND', 'Subtitle cue was not found.', 'Reload the subtitle editor.'));
  }
  const updated: SubtitleSegment = {
    ...current,
    ...patch,
    text: patch.text === undefined ? current.text : patch.text.trim(),
    style: { ...current.style, ...patch.style },
    words: patch.words === undefined ? current.words : [...patch.words],
  };
  const error = validateSegment(updated);
  if (error) return err(error);
  if (document.segments.some((segment) => segment.id !== segmentId && overlaps(segment, updated))) {
    return err(
      appError('CONFLICT', 'Updated subtitle timing overlaps another cue.', 'Choose a free range.'),
    );
  }
  return ok({
    ...document,
    segments: document.segments
      .map((segment) => (segment.id === segmentId ? updated : segment))
      .sort((left, right) => left.start - right.start),
  });
}

/** Removes a cue; missing ids are an idempotent no-op. */
export function removeSubtitleSegment(
  document: SubtitleDocument,
  segmentId: SegmentId,
): SubtitleDocument {
  return {
    ...document,
    segments: document.segments.filter((segment) => segment.id !== segmentId),
  };
}

/** Shifts all cues while refusing to move any timing before zero. */
export function shiftSubtitles(
  document: SubtitleDocument,
  delta: Milliseconds,
): Result<SubtitleDocument> {
  if (!Number.isFinite(delta) || document.segments.some((segment) => segment.start + delta < 0)) {
    return err(
      appError(
        'VALIDATION',
        'Subtitle shift would move timing before zero.',
        'Use a smaller shift.',
      ),
    );
  }
  return ok({
    ...document,
    segments: document.segments.map((segment) => ({
      ...segment,
      start: (segment.start + delta) as Milliseconds,
      end: (segment.end + delta) as Milliseconds,
      words: segment.words.map((word) => ({
        ...word,
        start: (word.start + delta) as Milliseconds,
        end: (word.end + delta) as Milliseconds,
      })),
    })),
  });
}

/** Splits a cue and partitions word timings at an absolute project time. */
export function splitSubtitleSegment(
  document: SubtitleDocument,
  segmentId: SegmentId,
  at: Milliseconds,
): Result<SubtitleDocument> {
  const segment = document.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    return err(appError('NOT_FOUND', 'Subtitle cue was not found.', 'Reload the subtitle editor.'));
  }
  if (!Number.isFinite(at) || at <= segment.start || at >= segment.end) {
    return err(
      appError('VALIDATION', 'Subtitle split must be inside the cue.', 'Choose an interior time.'),
    );
  }
  const leftWords = segment.words.filter((word) => word.start < at);
  const rightWords = segment.words.filter((word) => word.end > at);
  const left: SubtitleSegment = {
    ...segment,
    end: at,
    text: textFromWords(leftWords, segment.text),
    words: leftWords,
  };
  const right: SubtitleSegment = {
    ...segment,
    id: crypto.randomUUID() as SegmentId,
    start: at,
    text: textFromWords(rightWords, segment.text),
    words: rightWords,
  };
  return ok({
    ...document,
    segments: document.segments.flatMap((candidate) =>
      candidate.id === segmentId ? [left, right] : [candidate],
    ),
  });
}

function validateSegment(segment: SubtitleSegment) {
  if (
    !Number.isFinite(segment.start) ||
    !Number.isFinite(segment.end) ||
    segment.start < 0 ||
    segment.end <= segment.start ||
    !segment.text ||
    segment.text.length > 10_000
  ) {
    return appError(
      'VALIDATION',
      'Subtitle cue needs non-empty text and a positive finite time range.',
      'Correct the cue text and timing.',
    );
  }
  const ordered = [...segment.words].sort((left, right) => left.start - right.start);
  for (let index = 0; index < ordered.length; index += 1) {
    const word = ordered[index];
    const previous = ordered[index - 1];
    if (
      !word ||
      !word.text.trim() ||
      word.start < segment.start ||
      word.end > segment.end ||
      word.end <= word.start ||
      (previous !== undefined && previous.end > word.start)
    ) {
      return appError(
        'VALIDATION',
        'Word timing is outside its cue or overlaps another word.',
        'Regenerate word timing or correct the affected word.',
      );
    }
  }
  return undefined;
}

function overlaps(left: SubtitleSegment, right: SubtitleSegment): boolean {
  return left.start < right.end && right.start < left.end;
}

function textFromWords(words: readonly SubtitleWord[], fallback: string): string {
  const text = words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(' ');
  return text || fallback;
}
