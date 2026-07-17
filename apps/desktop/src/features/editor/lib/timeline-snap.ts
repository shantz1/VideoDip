import type { Milliseconds } from '@videodip/shared';

/**
 * Snaps a proposed timeline time to its nearest target within a pixel-derived
 * threshold. Equal-distance targets resolve to the earlier time for stability.
 */
export function snapTimelineTime(
  proposed: Milliseconds,
  targets: readonly Milliseconds[],
  threshold: Milliseconds,
): Milliseconds {
  let snapped = proposed;
  let closestDistance = threshold + 1;

  for (const target of targets) {
    const distance = Math.abs(target - proposed);
    if (distance < closestDistance || (distance === closestDistance && target < snapped)) {
      closestDistance = distance;
      snapped = target;
    }
  }

  return closestDistance <= threshold ? snapped : proposed;
}
