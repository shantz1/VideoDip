import { ms, normalized, type Transcription } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { transcriptionToSubtitles } from './transcription-to-subtitles';

const transcription: Transcription = {
  language: 'hi',
  durationMs: ms(250),
  segments: [
    {
      text: 'namaste duniya',
      start: ms(1_000),
      end: ms(3_000),
      words: [
        { text: 'namaste', start: ms(1_000), end: ms(1_800), confidence: normalized(0.9) },
        { text: 'duniya', start: ms(1_900), end: ms(3_000) },
      ],
    },
  ],
};

describe('transcriptionToSubtitles', () => {
  it('maps source timestamps into a trimmed clip on the project timeline', () => {
    const result = transcriptionToSubtitles(transcription, {
      start: ms(5_000),
      sourceStart: ms(1_500),
      duration: ms(4_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.language).toBe('hi');
    expect(result.value.segments[0]).toMatchObject({ start: 5_000, end: 6_500 });
    expect(result.value.segments[0]?.words).toEqual([
      expect.objectContaining({ text: 'namaste', start: 5_000, end: 5_300, confidence: 0.9 }),
      expect.objectContaining({ text: 'duniya', start: 5_400, end: 6_500 }),
    ]);
  });

  it('returns an actionable error when the visible clip contains no speech', () => {
    const result = transcriptionToSubtitles(transcription, {
      start: ms(0),
      sourceStart: ms(4_000),
      duration: ms(1_000),
    });
    expect(result.ok).toBe(false);
  });
});
