import { describe, expect, it } from 'vitest';
import {
  containedMediaSize,
  moveClipPreviewTransform,
  resizeClipPreviewTransform,
} from './clip-preview-transform';

const transform = {
  positionX: 0,
  positionY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

describe('clip preview transform geometry', () => {
  it('matches object-fit contain for horizontal media in a portrait frame', () => {
    expect(containedMediaSize(1080, 1920, 1920, 1080)).toEqual({
      width: 1,
      height: 0.31640625,
    });
  });

  it('moves in stage-relative coordinates and snaps to center', () => {
    const moved = moveClipPreviewTransform(
      { ...transform, positionX: 0.2, positionY: 0.2 },
      -96,
      -192,
      480,
      960,
      true,
    );
    expect(moved.transform.positionX).toBe(0);
    expect(moved.transform.positionY).toBe(0);
    expect(moved.verticalGuide).toBe(0.5);
    expect(moved.horizontalGuide).toBe(0.5);
  });

  it('uniformly resizes from the clip center and clamps tiny scales', () => {
    expect(resizeClipPreviewTransform(transform, 100, 150)).toMatchObject({
      scaleX: 1.5,
      scaleY: 1.5,
    });
    expect(resizeClipPreviewTransform(transform, 100, 0)).toMatchObject({
      scaleX: 0.05,
      scaleY: 0.05,
    });
  });
});
