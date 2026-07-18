import { normalized } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { moveSubtitlePosition, nudgeSubtitlePosition } from './subtitle-preview-position';

describe('subtitle preview positioning', () => {
  it('maps pointer pixels through the actual stage dimensions', () => {
    expect(
      moveSubtitlePosition(
        { positionX: normalized(0.5), positionY: normalized(0.5) },
        54,
        -96,
        1080,
        1920,
        false,
      ),
    ).toMatchObject({ positionX: 0.55, positionY: 0.45 });
  });

  it('snaps independently to safe-area and center guides', () => {
    expect(
      moveSubtitlePosition(
        { positionX: normalized(0.48), positionY: normalized(0.88) },
        10,
        20,
        1000,
        1000,
        true,
        25,
      ),
    ).toMatchObject({
      positionX: 0.5,
      positionY: 0.9,
      verticalGuide: 0.5,
      horizontalGuide: 0.9,
    });
  });

  it('clamps keyboard nudges to the composition', () => {
    expect(
      nudgeSubtitlePosition(
        { positionX: normalized(0.995), positionY: normalized(0.005) },
        0.01,
        -0.01,
      ),
    ).toEqual({ positionX: 1, positionY: 0 });
  });
});
