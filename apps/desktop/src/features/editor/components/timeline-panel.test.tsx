import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  calculateAnchoredScrollLeft,
  calculateFitZoom,
  trackColorClass,
} from '../lib/timeline-presentation';

describe('timeline presentation', () => {
  it('uses generated semantic background utilities for visible core clips', () => {
    expect(trackColorClass('video')).toBe('bg-track-video');
    expect(trackColorClass('audio')).toBe('bg-track-audio');
    expect(trackColorClass('subtitle')).toBe('bg-track-subtitle');
  });

  it('gives plugin-defined tracks a visible semantic fallback', () => {
    expect(trackColorClass('plugin:mask')).toBe('bg-accent');
  });

  it('fits content duration to the measured viewport width', () => {
    expect(calculateFitZoom(1_200, ms(30_000))).toBe(40);
  });

  it('uses the minimum empty-canvas duration when fitting short projects', () => {
    expect(calculateFitZoom(1_000, ms(2_000))).toBe(100);
  });

  it('keeps the time under the pointer anchored while zooming', () => {
    // At 50 px/s, scroll 200 + pointer 300 is second 10. At 100 px/s,
    // second 10 must remain under pointer 300, requiring scroll 700.
    expect(calculateAnchoredScrollLeft(200, 300, 50, 100)).toBe(700);
  });

  it('never asks the viewport to scroll before the timeline start', () => {
    expect(calculateAnchoredScrollLeft(0, 20, 100, 5)).toBe(0);
  });
});
