import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { snapTimelineTime } from './timeline-snap';

describe('snapTimelineTime', () => {
  it('snaps to the nearest target inside the threshold', () => {
    expect(snapTimelineTime(ms(980), [ms(0), ms(1000), ms(2000)], ms(50))).toBe(1000);
  });

  it('keeps the proposed time when no target is close enough', () => {
    expect(snapTimelineTime(ms(800), [ms(1000)], ms(50))).toBe(800);
  });

  it('includes the threshold boundary', () => {
    expect(snapTimelineTime(ms(950), [ms(1000)], ms(50))).toBe(1000);
  });

  it('uses the earlier target when distances are equal', () => {
    expect(snapTimelineTime(ms(1000), [ms(1100), ms(900)], ms(100))).toBe(900);
  });
});
