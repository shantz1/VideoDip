import { ms, type AssetId, type TrackId } from '@videodip/shared';
import { addClip, createTimeline, createTrack } from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { toCompositionClips } from './composition-adapter';

const ASSET = 'asset-a' as AssetId;
const VIDEO = 'video' as TrackId;
const AUDIO = 'audio' as TrackId;

const resolveVideo = () => ({ src: 'file:///a.mp4', mediaKind: 'video' as const });
const resolveAudio = () => ({ src: 'file:///a.mp3', mediaKind: 'audio' as const });

function createEmptyTimeline() {
  return createTimeline([
    createTrack({ id: 'subtitle' as TrackId, kind: 'subtitle', label: 'Subtitles' }),
    createTrack({ id: VIDEO, kind: 'video', label: 'Video' }),
    createTrack({ id: AUDIO, kind: 'audio', label: 'Audio' }),
  ]);
}

function docWithClip(trackId: TrackId, start: number, duration: number, sourceStart = 0) {
  const result = addClip(createEmptyTimeline(), {
    trackId,
    assetId: ASSET,
    start: ms(start),
    duration: ms(duration),
    sourceStart: ms(sourceStart),
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('toCompositionClips', () => {
  it('converts milliseconds to frames at the given rate', () => {
    const doc = docWithClip(VIDEO, 1000, 2000, 500);
    const clips = toCompositionClips(doc, resolveVideo);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      trackKind: 'video',
      mediaKind: 'video',
      src: 'file:///a.mp4',
      startFrame: 30,
      durationInFrames: 60,
      sourceStartFrame: 15,
    });
  });

  it('keeps track metadata separate from the asset media kind', () => {
    const doc = docWithClip(AUDIO, 0, 1000);
    const clips = toCompositionClips(doc, resolveAudio);
    expect(clips[0]).toMatchObject({ trackKind: 'audio', mediaKind: 'audio' });
  });

  it('drops clips whose asset cannot be resolved instead of emitting broken sources', () => {
    const doc = docWithClip(VIDEO, 0, 1000);
    expect(toCompositionClips(doc, () => undefined)).toHaveLength(0);
  });

  it('never emits a zero-frame clip even for sub-frame durations', () => {
    const doc = docWithClip(VIDEO, 0, 10);
    const clips = toCompositionClips(doc, resolveVideo);
    expect(clips[0]?.durationInFrames).toBe(1);
  });

  it('returns an empty list for an empty timeline', () => {
    expect(toCompositionClips(createEmptyTimeline(), resolveVideo)).toHaveLength(0);
  });

  it('orders layers from audio through video to topmost subtitles', () => {
    let document = createEmptyTimeline();
    for (const trackId of ['subtitle', 'video', 'audio'] as TrackId[]) {
      const result = addClip(document, {
        trackId,
        assetId: `${trackId}-asset` as AssetId,
        start: ms(0),
        duration: ms(1000),
      });
      if (!result.ok) throw new Error(result.error.message);
      document = result.value;
    }

    expect(
      toCompositionClips(document, (assetId) => ({
        src: String(assetId),
        mediaKind: String(assetId).startsWith('audio') ? 'audio' : 'video',
      })).map((clip) => clip.trackKind),
    ).toEqual(['audio', 'video', 'subtitle']);
  });

  it('preserves arbitrary track kinds in document layer order', () => {
    const overlayId = 'overlay-a' as TrackId;
    let document = createTimeline([
      createTrack({ id: overlayId, kind: 'plugin:overlay', label: 'Plugin overlay' }),
      createTrack({ id: VIDEO, kind: 'video', label: 'Video' }),
    ]);
    for (const trackId of [overlayId, VIDEO]) {
      const result = addClip(document, {
        trackId,
        assetId: `${trackId}-asset` as AssetId,
        start: ms(0),
        duration: ms(1000),
      });
      if (!result.ok) throw new Error(result.error.message);
      document = result.value;
    }

    const clips = toCompositionClips(document, (assetId) => ({
      src: String(assetId),
      mediaKind: 'video',
    }));

    expect(clips.map((clip) => clip.trackKind)).toEqual(['video', 'plugin:overlay']);
    expect(clips.map((clip) => clip.mediaKind)).toEqual(['video', 'video']);
  });
});
