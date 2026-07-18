import { normalized, type Normalized } from '@videodip/shared';

/** Safe-area and center guides used by direct subtitle manipulation. */
export const SUBTITLE_SNAP_GUIDES = [0.1, 0.5, 0.9] as const;

/** Normalized anchor used by both pointer and keyboard positioning. */
export interface SubtitlePosition {
  readonly positionX: Normalized;
  readonly positionY: Normalized;
}

/** Position result plus any guides activated by safe-area snapping. */
export interface SubtitleSnapResult extends SubtitlePosition {
  readonly verticalGuide: number | null;
  readonly horizontalGuide: number | null;
}

/** Maps stage-space pointer movement to normalized composition coordinates. */
export function moveSubtitlePosition(
  start: SubtitlePosition,
  deltaX: number,
  deltaY: number,
  stageWidth: number,
  stageHeight: number,
  isSnapEnabled: boolean,
  thresholdPixels = 8,
): SubtitleSnapResult {
  const rawX = clamp01(start.positionX + (stageWidth > 0 ? deltaX / stageWidth : 0));
  const rawY = clamp01(start.positionY + (stageHeight > 0 ? deltaY / stageHeight : 0));
  const x = isSnapEnabled ? snapAxis(rawX, stageWidth, thresholdPixels) : null;
  const y = isSnapEnabled ? snapAxis(rawY, stageHeight, thresholdPixels) : null;
  return {
    positionX: normalized(x ?? rawX),
    positionY: normalized(y ?? rawY),
    verticalGuide: x,
    horizontalGuide: y,
  };
}

/** Applies a normalized keyboard nudge while keeping the anchor on-canvas. */
export function nudgeSubtitlePosition(
  position: SubtitlePosition,
  deltaX: number,
  deltaY: number,
): SubtitlePosition {
  return {
    positionX: normalized(clamp01(position.positionX + deltaX)),
    positionY: normalized(clamp01(position.positionY + deltaY)),
  };
}

function snapAxis(value: number, dimension: number, thresholdPixels: number): number | null {
  const threshold = dimension > 0 ? thresholdPixels / dimension : 0;
  return SUBTITLE_SNAP_GUIDES.find((guide) => Math.abs(value - guide) <= threshold) ?? null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
