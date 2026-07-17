import { ms, type AssetId, type TrackId } from '@videodip/shared';
import { addClip, createTimeline, createTrack } from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { exportFrameSize, toExportClips } from './export-video';

const ASSET_A = 'asset-a' as AssetId;
const ASSET_B = 'asset-b' as AssetId;
const VIDEO = 'video' as TrackId;

function createEmptyTimeline() {
  return createTimeline([createTrack({ id: VIDEO, kind: 'video', label: 'Video' })]);
}

function unwrap<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got error: ${result.error.message}`);
  return result.value;
}

describe('exportFrameSize', () => {
  it.each([
    ['9:16', 1080, 1920],
    ['3:4', 1080, 1440],
    ['4:5', 1080, 1350],
    ['16:9', 1920, 1080],
  ] as const)('%s exports at %dx%d (1080 short edge)', (ratio, width, height) => {
    expect(exportFrameSize(ratio)).toEqual({ width, height });
  });
});

describe('toExportClips', () => {
  it('is empty for an empty timeline', () => {
    expect(unwrap(toExportClips(createEmptyTimeline(), () => 'C:\\a.mp4'))).toEqual([]);
  });

  it('flattens video-track clips in start order with resolved paths', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, {
        trackId: VIDEO,
        assetId: ASSET_B,
        start: ms(5000),
        duration: ms(1000),
        sourceStart: ms(250),
      }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(2000) }),
    );

    const paths = new Map([
      [ASSET_A, 'C:\\media\\a.mp4'],
      [ASSET_B, 'C:\\media\\b.mp4'],
    ]);
    const clips = unwrap(toExportClips(doc, (id) => paths.get(id)));

    expect(clips).toEqual([
      { src: 'C:\\media\\a.mp4', sourceStart: 0, duration: 2000 },
      { src: 'C:\\media\\b.mp4', sourceStart: 250, duration: 1000 },
    ]);
  });

  it('errors, rather than silently dropping, a clip whose asset is gone', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );

    const result = toExportClips(doc, () => undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.recovery).toContain('re-import');
    }
  });
});
