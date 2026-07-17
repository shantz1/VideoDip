import {
  addSubtitleSegment,
  createSubtitleDocument,
  type SubtitleDocument,
  type SubtitleWord,
} from '@videodip/subtitle-engine';
import { appError, err, ms, ok, type Result, type Transcription } from '@videodip/shared';
import type { Clip } from '@videodip/timeline';

/**
 * Maps source-relative speech timestamps into one placed timeline clip.
 *
 * Trimmed-away speech is discarded and boundary words are clamped so the
 * resulting document always satisfies subtitle-engine timing invariants.
 */
export function transcriptionToSubtitles(
  transcription: Transcription,
  clip: Pick<Clip, 'start' | 'sourceStart' | 'duration'>,
): Result<SubtitleDocument> {
  const sourceEnd = clip.sourceStart + clip.duration;
  let document = createSubtitleDocument(transcription.language);
  let previousEnd = clip.start;

  for (const [segmentIndex, segment] of transcription.segments.entries()) {
    if (segment.end <= clip.sourceStart || segment.start >= sourceEnd) continue;

    const mappedStart = clip.start + Math.max(segment.start, clip.sourceStart) - clip.sourceStart;
    const mappedEnd = clip.start + Math.min(segment.end, sourceEnd) - clip.sourceStart;
    const start = ms(Math.max(mappedStart, previousEnd));
    const end = ms(mappedEnd);
    if (end <= start || !segment.text.trim()) continue;

    const words = mapWords(segment.words, clip, start, end, segmentIndex);
    const added = addSubtitleSegment(document, {
      start,
      end,
      text: segment.text,
      words,
      ...(segment.speaker === undefined ? {} : { speaker: segment.speaker }),
    });
    if (!added.ok) return added;
    document = added.value;
    previousEnd = end;
  }

  return document.segments.length > 0
    ? ok(document)
    : err(
        appError(
          'NOT_FOUND',
          'Whisper found no speech in the visible part of this clip.',
          'Choose another clip or language, then retry.',
        ),
      );
}

function mapWords(
  words: Transcription['segments'][number]['words'],
  clip: Pick<Clip, 'start' | 'sourceStart' | 'duration'>,
  cueStart: ReturnType<typeof ms>,
  cueEnd: ReturnType<typeof ms>,
  segmentIndex: number,
): SubtitleWord[] {
  const sourceEnd = clip.sourceStart + clip.duration;
  const mapped: SubtitleWord[] = [];
  let previousEnd = cueStart;
  for (const [wordIndex, word] of words.entries()) {
    if (word.end <= clip.sourceStart || word.start >= sourceEnd) continue;
    const start = ms(
      Math.max(
        previousEnd,
        cueStart,
        clip.start + Math.max(word.start, clip.sourceStart) - clip.sourceStart,
      ),
    );
    const end = ms(Math.min(cueEnd, clip.start + Math.min(word.end, sourceEnd) - clip.sourceStart));
    if (end <= start || !word.text.trim()) continue;
    mapped.push({
      id: `whisper-${segmentIndex}-${wordIndex}`,
      text: word.text.trim(),
      start,
      end,
      confidence: word.confidence ?? null,
    });
    previousEnd = end;
  }
  return mapped;
}
