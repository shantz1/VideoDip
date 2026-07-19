import type { ClipTransform } from '@videodip/timeline';

const POSITION_MIN = -2;
const POSITION_MAX = 2;
const SCALE_MIN = 0.05;
const SCALE_MAX = 10;
const SNAP_THRESHOLD_PX = 8;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Fractional size of source media after `object-fit: contain` inside the stage. */
export interface ContainedMediaSize {
  readonly width: number;
  readonly height: number;
}

/** Position result plus optional normalized center snap guides. */
export interface MovedClipTransform {
  readonly transform: ClipTransform;
  readonly verticalGuide: number | null;
  readonly horizontalGuide: number | null;
}

/** Calculates the visible source rectangle used by Remotion's contain fit. */
export function containedMediaSize(
  frameWidth: number,
  frameHeight: number,
  sourceWidth?: number,
  sourceHeight?: number,
): ContainedMediaSize {
  if (
    !sourceWidth ||
    !sourceHeight ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return { width: 1, height: 1 };
  }
  const frameAspect = frameWidth / frameHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  return sourceAspect >= frameAspect
    ? { width: 1, height: frameAspect / sourceAspect }
    : { width: sourceAspect / frameAspect, height: 1 };
}

/** Moves a clip in stage-relative coordinates and optionally snaps its center. */
export function moveClipPreviewTransform(
  initial: ClipTransform,
  deltaX: number,
  deltaY: number,
  stageWidth: number,
  stageHeight: number,
  isSnappingEnabled: boolean,
): MovedClipTransform {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return { transform: initial, verticalGuide: null, horizontalGuide: null };
  }
  let positionX = clamp(initial.positionX + deltaX / stageWidth, POSITION_MIN, POSITION_MAX);
  let positionY = clamp(initial.positionY + deltaY / stageHeight, POSITION_MIN, POSITION_MAX);
  let verticalGuide: number | null = null;
  let horizontalGuide: number | null = null;
  if (isSnappingEnabled && Math.abs(positionX) * stageWidth <= SNAP_THRESHOLD_PX) {
    positionX = 0;
    verticalGuide = 0.5;
  }
  if (isSnappingEnabled && Math.abs(positionY) * stageHeight <= SNAP_THRESHOLD_PX) {
    positionY = 0;
    horizontalGuide = 0.5;
  }
  return {
    transform: { ...initial, positionX, positionY },
    verticalGuide,
    horizontalGuide,
  };
}

/** Uniformly resizes a clip from pointer distances measured around its center. */
export function resizeClipPreviewTransform(
  initial: ClipTransform,
  initialDistance: number,
  currentDistance: number,
): ClipTransform {
  if (initialDistance <= 0 || !Number.isFinite(currentDistance)) return initial;
  const ratio = Math.max(0, currentDistance) / initialDistance;
  return {
    ...initial,
    scaleX: clamp(initial.scaleX * ratio, SCALE_MIN, SCALE_MAX),
    scaleY: clamp(initial.scaleY * ratio, SCALE_MIN, SCALE_MAX),
  };
}
