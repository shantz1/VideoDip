import { ms, type AssetId, type TrackId } from '@videodip/shared';
import {
  addClip,
  addTransition,
  createTimeline,
  createTrack,
  updateTrackState,
} from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { addSubtitleSegment, createSubtitleDocument } from '@videodip/subtitle-engine';
import { toCompositionClips, toCompositionSubtitles } from './composition-adapter';

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
      transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      opacity: 1,
      blendMode: 'normal',
      isEnabled: true,
      animation: [],
      audio: { volume: 1, isMuted: false, fadeInFrames: 0, fadeOutFrames: 0 },
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

  it('omits hidden tracks and combines track mute with clip audio', () => {
    let hidden = docWithClip(VIDEO, 0, 1000);
    hidden = unwrapTimeline(updateTrackState(hidden, VIDEO, { isVisible: false }));
    expect(toCompositionClips(hidden, resolveVideo)).toEqual([]);

    let muted = docWithClip(VIDEO, 0, 1000);
    muted = unwrapTimeline(updateTrackState(muted, VIDEO, { isMuted: true }));
    expect(toCompositionClips(muted, resolveVideo)[0]?.audio.isMuted).toBe(true);
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

  it('resolves one transition onto both adjacent composition endpoints', () => {
    let document = createEmptyTimeline();
    document = unwrapTimeline(
      addClip(document, {
        trackId: VIDEO,
        assetId: 'asset-a' as AssetId,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    document = unwrapTimeline(
      addClip(document, {
        trackId: VIDEO,
        assetId: 'asset-b' as AssetId,
        start: ms(1000),
        duration: ms(1000),
      }),
    );
    const [from, to] = document.tracks.find((track) => track.id === VIDEO)?.clips ?? [];
    if (!from || !to) throw new Error('Expected adjacent clips.');
    document = unwrapTimeline(
      addTransition(document, {
        fromClipId: from.id,
        toClipId: to.id,
        kind: 'wipe-left',
        duration: ms(500),
      }),
    );

    const clips = toCompositionClips(document, (assetId) => ({
      src: String(assetId),
      mediaKind: 'video',
    }));
    expect(clips[0]?.transitionOut).toMatchObject({ kind: 'wipe-left', durationInFrames: 15 });
    expect(clips[1]?.transitionIn).toEqual(clips[0]?.transitionOut);
  });
});

describe('toCompositionSubtitles', () => {
  it('converts absolute cue and word timings to clip-relative frames', () => {
    const added = addSubtitleSegment(createSubtitleDocument('en'), {
      start: ms(1000),
      end: ms(3000),
      text: 'Hello world',
      words: [
        { id: 'hello', text: 'Hello', start: ms(1000), end: ms(1800), confidence: null },
        { id: 'world', text: 'world', start: ms(1900), end: ms(3000), confidence: null },
      ],
      style: { fontWeight: 800 },
    });
    if (!added.ok) throw new Error(added.error.message);
    expect(toCompositionSubtitles(added.value)[0]).toMatchObject({
      startFrame: 30,
      durationInFrames: 60,
      words: [
        { text: 'Hello', startFrame: 0, endFrame: 24 },
        { text: 'world', startFrame: 27, endFrame: 60 },
      ],
      style: { fontWeight: 800, positionX: 0.5, positionY: 0.88 },
    });
  });

  it('sends a fully resolved style and applies transient preview as the final layer', () => {
    const added = addSubtitleSegment(createSubtitleDocument('en'), {
      id: 'previewed' as never,
      start: ms(0),
      end: ms(1000),
      text: 'Preview',
      style: { foreground: '#112233', fontWeight: 400 },
    });
    if (!added.ok) throw new Error(added.error.message);
    const [subtitle] = toCompositionSubtitles(added.value, undefined, {
      previewed: { foreground: '#abcdef' },
    });

    expect(subtitle?.style).toMatchObject({
      fontFamily: 'sans-serif',
      fontSize: 48,
      fontWeight: 400,
      foreground: '#abcdef',
      opacity: 1,
      backgroundEnabled: true,
      strokeWidth: 0,
      shadowOpacity: 0,
      maxWidth: 0.9,
      rotation: 0,
      scale: 1,
    });
    expect(Object.values(subtitle?.style ?? {})).not.toContain(null);
  });
});

function unwrapTimeline<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
