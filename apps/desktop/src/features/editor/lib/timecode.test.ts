import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { formatTimecode } from './timecode';

describe('formatTimecode', () => {
  it('formats zero', () => {
    expect(formatTimecode(ms(0))).toBe('00:00.00');
  });

  it('formats sub-minute times with centiseconds', () => {
    expect(formatTimecode(ms(5_430))).toBe('00:05.43');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimecode(ms(65_432))).toBe('01:05.43');
  });

  it('omits the hour segment under an hour', () => {
    expect(formatTimecode(ms(3_599_990))).toBe('59:59.99');
  });

  it('adds the hour segment at and past an hour', () => {
    expect(formatTimecode(ms(3_600_000))).toBe('1:00:00.00');
  });

  it('truncates rather than rounds centiseconds', () => {
    // 999ms is still within the same second: rounding up would display
    // ".100", implying a second that has not elapsed.
    expect(formatTimecode(ms(999))).toBe('00:00.99');
  });

  it('clamps negative input to zero rather than emitting a broken string', () => {
    expect(formatTimecode(ms(-1000))).toBe('00:00.00');
  });
});
