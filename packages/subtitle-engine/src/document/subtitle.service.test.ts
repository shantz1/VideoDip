import { ms, normalized, type SegmentId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  addSubtitleSegment,
  createSubtitleDocument,
  removeSubtitleSegment,
  shiftSubtitles,
  splitSubtitleSegment,
  updateSubtitleSegment,
} from './subtitle.service.js';

describe('subtitle document', () => {
  it('adds cues chronologically and rejects overlap', () => {
    let document = createSubtitleDocument('hi');
    document = unwrap(
      addSubtitleSegment(document, {
        id: 'second' as SegmentId,
        start: ms(2000),
        end: ms(3000),
        text: 'दूसरा',
      }),
    );
    document = unwrap(
      addSubtitleSegment(document, {
        id: 'first' as SegmentId,
        start: ms(0),
        end: ms(1000),
        text: 'पहला',
      }),
    );

    expect(document.segments.map((segment) => segment.id)).toEqual(['first', 'second']);
    expect(
      addSubtitleSegment(document, { start: ms(500), end: ms(2500), text: 'overlap' }).ok,
    ).toBe(false);
  });

  it('validates word timing inside a cue', () => {
    const result = addSubtitleSegment(createSubtitleDocument(), {
      start: ms(0),
      end: ms(1000),
      text: 'hello',
      words: [
        {
          id: 'word-1',
          text: 'hello',
          start: ms(100),
          end: ms(900),
          confidence: normalized(0.9),
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('updates, shifts, splits, and removes cues immutably', () => {
    const original = unwrap(
      addSubtitleSegment(createSubtitleDocument(), {
        id: 'cue' as SegmentId,
        start: ms(1000),
        end: ms(3000),
        text: 'hello world',
        words: [
          { id: 'one', text: 'hello', start: ms(1000), end: ms(1800), confidence: null },
          { id: 'two', text: 'world', start: ms(2000), end: ms(3000), confidence: null },
        ],
      }),
    );
    const updated = unwrap(
      updateSubtitleSegment(original, 'cue' as SegmentId, { speaker: 'Host' }),
    );
    const shifted = unwrap(shiftSubtitles(updated, ms(500)));
    const split = unwrap(splitSubtitleSegment(shifted, 'cue' as SegmentId, ms(2500)));

    expect(original.segments[0]?.speaker).toBeNull();
    expect(split.segments.map((segment) => segment.text)).toEqual(['hello', 'world']);
    expect(removeSubtitleSegment(split, split.segments[0]!.id).segments).toHaveLength(1);
  });
});

function unwrap<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
