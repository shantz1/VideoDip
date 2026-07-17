import { ms, type Milliseconds } from '@videodip/shared';

/** Empty-canvas space available for placing the first clip. */
export const MIN_VIEW_DURATION = ms(10_000);

/** Returns the semantic background utility for a core or plugin track kind. */
export function trackColorClass(kind: string): string {
  if (kind === 'subtitle') return 'bg-track-subtitle';
  if (kind === 'video') return 'bg-track-video';
  if (kind === 'audio') return 'bg-track-audio';
  if (kind === 'overlay') return 'bg-track-overlay';
  if (kind === 'effect') return 'bg-track-effect';
  return 'bg-accent';
}

/** Computes pixels per second required to contain the whole timeline. */
export function calculateFitZoom(viewportWidth: number, contentDuration: Milliseconds): number {
  const viewDuration = Math.max(MIN_VIEW_DURATION, contentDuration);
  return viewportWidth / (viewDuration / 1000);
}

/** Keeps the timeline time beneath the pointer fixed while zoom changes. */
export function calculateAnchoredScrollLeft(
  scrollLeft: number,
  pointerX: number,
  previousZoom: number,
  nextZoom: number,
): number {
  const secondsAtPointer = (scrollLeft + pointerX) / previousZoom;
  return Math.max(0, secondsAtPointer * nextZoom - pointerX);
}
