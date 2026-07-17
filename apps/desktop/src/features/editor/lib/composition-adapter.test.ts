import { ms, type AssetId, type TrackId } from '@videodip/shared';
import { addClip, createEmptyTimeline } from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { toCompositionClips } from './composition-adapter';

const ASSET = 'asset-a' as AssetId;
const VIDEO = 'video' as TrackId;
const AUDIO = 'audio' as TrackId;

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
    const clips = toCompositionClips(doc, () => 'file:///a.mp4');

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      kind: 'video',
      src: 'file:///a.mp4',
      startFrame: 30,
      durationInFrames: 60,
      sourceStartFrame: 15,
    });
  });

  it('tags clips with their track kind', () => {
    const doc = docWithClip(AUDIO, 0, 1000);
    const clips = toCompositionClips(doc, () => 'file:///a.mp3');
    expect(clips[0]?.kind).toBe('audio');
  });

  it('drops clips whose asset cannot be resolved instead of emitting broken sources', () => {
    const doc = docWithClip(VIDEO, 0, 1000);
    expect(toCompositionClips(doc, () => undefined)).toHaveLength(0);
  });

  it('never emits a zero-frame clip even for sub-frame durations', () => {
    const doc = docWithClip(VIDEO, 0, 10);
    const clips = toCompositionClips(doc, () => 'file:///a.mp4');
    expect(clips[0]?.durationInFrames).toBe(1);
  });

  it('returns an empty list for an empty timeline', () => {
    expect(toCompositionClips(createEmptyTimeline(), () => 'x')).toHaveLength(0);
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
      toCompositionClips(document, (assetId) => String(assetId)).map((clip) => clip.kind),
    ).toEqual(['audio', 'video', 'subtitle']);
  });
});
