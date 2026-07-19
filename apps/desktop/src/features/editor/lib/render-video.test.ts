import { ms, type AssetId, type Result, type TrackId } from '@videodip/shared';
import { addSubtitleSegment, createSubtitleDocument } from '@videodip/subtitle-engine';
import { addClip, createTimeline, createTrack, updateTrackState } from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { buildRenderProps } from './render-video';

const ASSET = 'asset-a' as AssetId;
const VIDEO = 'video' as TrackId;

const resolveVideo = () => ({ path: 'C:\\media\\a.mp4', mediaKind: 'video' as const });

function createEmptyTimeline() {
  return createTimeline([createTrack({ id: VIDEO, kind: 'video', label: 'Video' })]);
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got error: ${result.error.message}`);
  return result.value;
}

function docWithClip(start: number, duration: number, isEnabled = true) {
  return unwrap(
    addClip(createEmptyTimeline(), {
      trackId: VIDEO,
      assetId: ASSET,
      start: ms(start),
      duration: ms(duration),
      isEnabled,
    }),
  );
}

const emptySubtitles = createSubtitleDocument('en');

describe('buildRenderProps', () => {
  it('produces the preview-identical composition contract with raw paths', () => {
    const props = unwrap(
      buildRenderProps(docWithClip(0, 2000), emptySubtitles, resolveVideo, '9:16'),
    );

    expect(props.settings).toEqual({ width: 1080, height: 1920, fps: 30, durationInFrames: 60 });
    expect(props.clips[0]).toMatchObject({
      src: 'C:\\media\\a.mp4',
      mediaKind: 'video',
      startFrame: 0,
      durationInFrames: 60,
    });
  });

  it('errors, rather than silently dropping, an enabled clip whose asset is gone', () => {
    const result = buildRenderProps(docWithClip(0, 1000), emptySubtitles, () => undefined, '9:16');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.recovery).toContain('re-import');
    }
  });

  it('tolerates a missing asset on a disabled clip — it would not render anyway', () => {
    const result = buildRenderProps(
      docWithClip(0, 1000, false),
      emptySubtitles,
      () => undefined,
      '9:16',
    );
    expect(result.ok).toBe(true);
  });

  it('extends the render to cover subtitles that outlast the timeline', () => {
    const added = addSubtitleSegment(emptySubtitles, {
      start: ms(0),
      end: ms(4000),
      text: 'Outlasts the clip',
      words: [],
    });
    if (!added.ok) throw new Error(added.error.message);

    const props = unwrap(buildRenderProps(docWithClip(0, 2000), added.value, resolveVideo, '9:16'));
    expect(props.settings.durationInFrames).toBe(120);
    expect(props.subtitles).toHaveLength(1);
  });

  it('omits subtitles from Full render when the subtitle track is hidden', () => {
    const added = addSubtitleSegment(emptySubtitles, {
      start: ms(0),
      end: ms(1000),
      text: 'Hidden caption',
      words: [],
    });
    if (!added.ok) throw new Error(added.error.message);
    let document = createTimeline([
      createTrack({ id: 'subtitle' as TrackId, kind: 'subtitle', label: 'Subtitles' }),
      createTrack({ id: VIDEO, kind: 'video', label: 'Video' }),
    ]);
    document = unwrap(
      addClip(document, {
        trackId: VIDEO,
        assetId: ASSET,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    document = unwrap(updateTrackState(document, 'subtitle' as TrackId, { isVisible: false }));

    expect(unwrap(buildRenderProps(document, added.value, resolveVideo, '9:16')).subtitles).toEqual(
      [],
    );
  });

  it('applies the selected export preset fps and keeps the project aspect ratio', () => {
    const props = unwrap(
      buildRenderProps(
        docWithClip(0, 1000),
        emptySubtitles,
        resolveVideo,
        '16:9',
        'shorts-vertical',
      ),
    );
    expect(props.settings).toMatchObject({ width: 1920, height: 1080, fps: 60 });
  });

  it('rejects an unknown export preset before any dialog could open', () => {
    const result = buildRenderProps(
      docWithClip(0, 1000),
      emptySubtitles,
      resolveVideo,
      '9:16',
      'no-such-preset' as never,
    );
    expect(result.ok).toBe(false);
  });
});
