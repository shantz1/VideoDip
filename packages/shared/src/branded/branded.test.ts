import { describe, expect, it } from 'vitest';
import { fps, frames, framesToMs, ms, msToFrames, normalized } from './branded.js';

describe('normalized', () => {
  it('clamps values above the range', () => {
    expect(normalized(1.7)).toBe(1);
  });

  it('clamps values below the range', () => {
    expect(normalized(-3)).toBe(0);
  });

  it('leaves in-range values untouched', () => {
    expect(normalized(0.42)).toBe(0.42);
  });
});

describe('frame/time conversion', () => {
  it('converts milliseconds to frames at 30fps', () => {
    expect(msToFrames(ms(1000), fps(30))).toBe(30);
  });

  it('rounds to the nearest frame rather than truncating', () => {
    // 16ms at 30fps is 0.48 frames -> 0, while 17ms is 0.51 -> 1.
    expect(msToFrames(ms(16), fps(30))).toBe(0);
    expect(msToFrames(ms(17), fps(30))).toBe(1);
  });

  it('converts frames back to milliseconds', () => {
    expect(framesToMs(frames(30), fps(30))).toBe(1000);
  });

  it('round-trips exactly on frame boundaries', () => {
    const rate = fps(24);
    expect(msToFrames(framesToMs(frames(48), rate), rate)).toBe(48);
  });

  it('handles fractional broadcast frame rates', () => {
    expect(msToFrames(ms(1001), fps(29.97))).toBe(30);
  });
});
