import { ms, normalized, type AssetId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  addClip,
  addTrack,
  createTimeline,
  createTrack,
  evaluateClipProperty,
  findFreeStart,
  getDuration,
  moveClip,
  removeClip,
  removeTrack,
  reorderTrack,
  setClipAnimation,
  splitClip,
  trimClip,
  updateClipProperties,
  updateClipAudio,
} from './document.service.js';
import type { TrackId } from '@videodip/shared';

const ASSET_A = 'asset-a' as AssetId;
const ASSET_B = 'asset-b' as AssetId;
const VIDEO: TrackId = 'video' as TrackId;
const AUDIO: TrackId = 'audio' as TrackId;

function createEmptyTimeline() {
  return createTimeline([
    createTrack({ id: VIDEO, kind: 'video', label: 'Video' }),
    createTrack({ id: 'subtitle' as TrackId, kind: 'subtitle', label: 'Subtitles' }),
    createTrack({ id: AUDIO, kind: 'audio', label: 'Audio' }),
  ]);
}

describe('generic tracks', () => {
  it('creates a timeline with no domain-defined tracks', () => {
    expect(createTimeline().tracks).toEqual([]);
  });

  it('preserves arbitrary consumer-defined kinds and order', () => {
    const doc = createTimeline([
      createTrack({ id: 'captions' as TrackId, kind: 'subtitle', label: 'Captions' }),
      createTrack({ id: 'plugin-layer' as TrackId, kind: 'plugin:mask', label: 'Mask' }),
    ]);

    expect(doc.tracks.map((track) => track.kind)).toEqual(['subtitle', 'plugin:mask']);
  });

  it('adds a track at an explicit visual index', () => {
    const result = addTrack(createEmptyTimeline(), { kind: 'overlay', label: 'Overlay' }, 1);
    const doc = unwrap(result);

    expect(doc.tracks.map((track) => track.kind)).toEqual([
      'video',
      'overlay',
      'subtitle',
      'audio',
    ]);
  });

  it('rejects duplicate track ids', () => {
    const result = addTrack(createEmptyTimeline(), {
      id: VIDEO,
      kind: 'overlay',
      label: 'Duplicate',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('reorders tracks without changing their contents', () => {
    const result = reorderTrack(createEmptyTimeline(), AUDIO, 0);

    expect(unwrap(result).tracks.map((track) => track.id)).toEqual([AUDIO, VIDEO, 'subtitle']);
  });

  it('removes an empty track', () => {
    const result = removeTrack(createEmptyTimeline(), AUDIO);
    expect(unwrap(result).tracks.some((track) => track.id === AUDIO)).toBe(false);
  });

  it('refuses to remove a track containing clips', () => {
    const document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const result = removeTrack(document, VIDEO);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('getDuration', () => {
  it('is zero for an empty timeline', () => {
    expect(getDuration(createEmptyTimeline())).toBe(0);
  });

  it('is the far edge of the latest clip across all tracks', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: AUDIO, assetId: ASSET_B, start: ms(2000), duration: ms(10_000) }),
    );

    expect(getDuration(doc)).toBe(12_000);
  });
});

describe('addClip', () => {
  it('places a clip on an empty track', () => {
    const result = addClip(createEmptyTimeline(), {
      trackId: VIDEO,
      assetId: ASSET_A,
      start: ms(0),
      duration: ms(3000),
    });

    expect(result.ok).toBe(true);
    const doc = unwrap(result);
    expect(doc.tracks.find((t) => t.id === VIDEO)?.clips).toHaveLength(1);
  });

  it('defaults sourceStart to zero when omitted', () => {
    const doc = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    expect(doc.tracks[0]?.clips[0]?.sourceStart).toBe(0);
  });

  it('creates clips with identity visuals and isolated metadata', () => {
    const metadata = { source: 'import' };
    const doc = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
        metadata,
      }),
    );
    metadata.source = 'mutated';

    expect(doc.tracks[0]?.clips[0]).toMatchObject({
      transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      opacity: 1,
      blendMode: 'normal',
      isEnabled: true,
      metadata: { source: 'import' },
    });
  });

  it('rejects invalid initial clip visuals', () => {
    const result = addClip(createEmptyTimeline(), {
      trackId: VIDEO,
      assetId: ASSET_A,
      start: ms(0),
      duration: ms(1000),
      transform: { scaleX: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects an unknown track', () => {
    const result = addClip(createEmptyTimeline(), {
      trackId: 'nope' as TrackId,
      assetId: ASSET_A,
      start: ms(0),
      duration: ms(1000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects negative, zero-length, and non-finite clip timing', () => {
    const invalidInputs = [
      { start: ms(-1), duration: ms(1000) },
      { start: ms(0), duration: ms(0) },
      { start: ms(Number.NaN), duration: ms(1000) },
    ];

    for (const timing of invalidInputs) {
      const result = addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        ...timing,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects a clip that overlaps an existing one on the same track', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );

    const result = addClip(doc, {
      trackId: VIDEO,
      assetId: ASSET_B,
      start: ms(2000),
      duration: ms(1000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('accepts a clip that starts exactly where another ends', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );

    const result = addClip(doc, {
      trackId: VIDEO,
      assetId: ASSET_B,
      start: ms(5000),
      duration: ms(1000),
    });
    expect(result.ok).toBe(true);
  });

  it('keeps a track sorted by start regardless of insertion order', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(5000), duration: ms(1000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(0), duration: ms(1000) }),
    );

    expect(doc.tracks[0]?.clips.map((c) => c.start)).toEqual([0, 5000]);
  });
});

describe('updateClipProperties', () => {
  it('updates visuals and metadata immutably', () => {
    const original = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
        metadata: { origin: 'camera' },
      }),
    );
    const clipId = original.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');

    const updated = unwrap(
      updateClipProperties(original, clipId, {
        transform: { positionX: 0.25, rotation: 15 },
        opacity: normalized(0.5),
        blendMode: 'screen',
        metadata: { reviewed: true },
      }),
    );

    expect(original.tracks[0]?.clips[0]?.transform.positionX).toBe(0);
    expect(updated.tracks[0]?.clips[0]).toMatchObject({
      transform: { positionX: 0.25, positionY: 0, scaleX: 1, scaleY: 1, rotation: 15 },
      opacity: 0.5,
      blendMode: 'screen',
      metadata: { origin: 'camera', reviewed: true },
    });
  });

  it('rejects invalid patches without changing the document', () => {
    const document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    const result = updateClipProperties(document, clipId, {
      transform: { scaleY: Number.NaN },
    });

    expect(result.ok).toBe(false);
    expect(document.tracks[0]?.clips[0]?.transform.scaleY).toBe(1);
  });
});

describe('clip animation', () => {
  it('validates, sorts and evaluates clip-relative keyframes', () => {
    const document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    const animated = unwrap(
      setClipAnimation(document, clipId, [
        { property: 'opacity', offset: ms(1000), value: 1, easing: 'ease-in' },
        { property: 'opacity', offset: ms(0), value: 0, easing: 'linear' },
      ]),
    );
    const clip = animated.tracks[0]?.clips[0];
    if (!clip) throw new Error('Expected an animated clip.');

    expect(clip.animation.map((keyframe) => keyframe.offset)).toEqual([0, 1000]);
    expect(evaluateClipProperty(clip, 'opacity', ms(500))).toBeCloseTo(0.25);
  });

  it('rejects duplicate and out-of-range keyframes', () => {
    const document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    const result = setClipAnimation(document, clipId, [
      { property: 'rotation', offset: ms(1500), value: 10, easing: 'linear' },
      { property: 'rotation', offset: ms(1500), value: 20, easing: 'linear' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('preserves animation continuity when splitting a clip', () => {
    let document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    document = unwrap(
      setClipAnimation(document, clipId, [
        { property: 'positionX', offset: ms(0), value: 0, easing: 'linear' },
        { property: 'positionX', offset: ms(1000), value: 1, easing: 'linear' },
      ]),
    );

    const split = unwrap(splitClip(document, clipId, ms(400)));
    const [left, right] = split.tracks[0]?.clips ?? [];
    if (!left || !right) throw new Error('Expected two clips.');
    expect(evaluateClipProperty(left, 'positionX', left.duration)).toBeCloseTo(0.4);
    expect(evaluateClipProperty(right, 'positionX', ms(0))).toBeCloseTo(0.4);
    expect(right.animation.at(-1)?.offset).toBe(600);
  });
});

describe('clip audio', () => {
  it('updates volume and fades with domain validation', () => {
    const document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: AUDIO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks.find((track) => track.id === AUDIO)?.clips[0]?.id;
    if (!clipId) throw new Error('Expected an audio clip.');
    const updated = unwrap(
      updateClipAudio(document, clipId, {
        volume: normalized(0.4),
        fadeIn: ms(250),
        fadeOut: ms(500),
      }),
    );
    expect(updated.tracks.find((track) => track.id === AUDIO)?.clips[0]?.audio).toEqual({
      volume: 0.4,
      isMuted: false,
      fadeIn: 250,
      fadeOut: 500,
    });
    expect(updateClipAudio(document, clipId, { fadeIn: ms(1500) }).ok).toBe(false);
  });

  it('keeps split fades inside both new clip durations', () => {
    let document = unwrap(
      addClip(createEmptyTimeline(), {
        trackId: AUDIO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
        audio: { fadeIn: ms(700), fadeOut: ms(700) },
      }),
    );
    const clipId = document.tracks.find((track) => track.id === AUDIO)?.clips[0]?.id;
    if (!clipId) throw new Error('Expected an audio clip.');
    document = unwrap(splitClip(document, clipId, ms(400)));
    const clips = document.tracks.find((track) => track.id === AUDIO)?.clips ?? [];
    expect(clips[0]?.audio).toMatchObject({ fadeIn: 400, fadeOut: 0 });
    expect(clips[1]?.audio).toMatchObject({ fadeIn: 0, fadeOut: 600 });
  });
});

describe('findFreeStart', () => {
  it('returns the preferred start on an empty track', () => {
    const result = findFreeStart(createEmptyTimeline(), VIDEO, ms(3000), ms(5000));
    expect(unwrap(result)).toBe(3000);
  });

  it('jumps past a clip occupying the preferred start', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );

    const result = findFreeStart(doc, VIDEO, ms(0), ms(5000));
    expect(unwrap(result)).toBe(5000);
  });

  it('cascades past back-to-back clips', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(5000), duration: ms(5000) }),
    );

    const result = findFreeStart(doc, VIDEO, ms(1000), ms(5000));
    expect(unwrap(result)).toBe(10_000);
  });

  it('skips a gap too small for the clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(2000), duration: ms(1000) }),
    );

    // The 1s gap at [1000, 2000) cannot hold a 5s clip.
    const result = findFreeStart(doc, VIDEO, ms(1000), ms(5000));
    expect(unwrap(result)).toBe(3000);
  });

  it('uses a gap that exactly fits the clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(6000), duration: ms(1000) }),
    );

    const result = findFreeStart(doc, VIDEO, ms(500), ms(5000));
    expect(unwrap(result)).toBe(1000);
  });

  it('returned position is always accepted by addClip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(5000) }),
    );

    const start = unwrap(findFreeStart(doc, VIDEO, ms(0), ms(5000)));
    const result = addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start, duration: ms(5000) });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown track', () => {
    const result = findFreeStart(createEmptyTimeline(), 'nope' as TrackId, ms(0), ms(1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects invalid placement timing', () => {
    const result = findFreeStart(createEmptyTimeline(), VIDEO, ms(-1), ms(1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

describe('removeClip', () => {
  it('removes an existing clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = removeClip(doc, clipId);
    expect(doc.tracks[0]?.clips).toHaveLength(0);
  });

  it('is a no-op for an id that does not exist', () => {
    const doc = createEmptyTimeline();
    expect(removeClip(doc, 'missing' as never)).toEqual(doc);
  });
});

describe('moveClip', () => {
  it('moves a clip within the same track', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(moveClip(doc, clipId, ms(5000)));
    expect(doc.tracks[0]?.clips[0]?.start).toBe(5000);
  });

  it('moves a clip to a different track', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(moveClip(doc, clipId, ms(0), AUDIO));
    expect(doc.tracks.find((t) => t.id === VIDEO)?.clips).toHaveLength(0);
    expect(doc.tracks.find((t) => t.id === AUDIO)?.clips).toHaveLength(1);
  });

  it('does not conflict with itself when moved a small distance', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = moveClip(doc, clipId, ms(100));
    expect(result.ok).toBe(true);
  });

  it('rejects a move that would overlap another clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(5000), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = moveClip(doc, clipId, ms(5200));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('rejects moving an unknown clip', () => {
    const result = moveClip(createEmptyTimeline(), 'missing' as never, ms(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects moving a clip before zero', () => {
    let document = createEmptyTimeline();
    document = unwrap(
      addClip(document, {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(1000),
      }),
    );
    const clipId = document.tracks[0]!.clips[0]!.id;

    const result = moveClip(document, clipId, ms(-1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

describe('trimClip', () => {
  it('trims the start edge, shifting sourceStart forward by the same amount', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(1000),
        duration: ms(5000),
        sourceStart: ms(200),
      }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(trimClip(doc, clipId, 'start', ms(2000)));
    const clip = doc.tracks[0]!.clips[0]!;
    expect(clip.start).toBe(2000);
    expect(clip.duration).toBe(4000);
    expect(clip.sourceStart).toBe(1200);
  });

  it('trims the end edge, shortening duration without touching sourceStart', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(5000),
        sourceStart: ms(200),
      }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(trimClip(doc, clipId, 'end', ms(3000)));
    const clip = doc.tracks[0]!.clips[0]!;
    expect(clip.start).toBe(0);
    expect(clip.duration).toBe(3000);
    expect(clip.sourceStart).toBe(200);
  });

  it('rejects trimming the start past the end of the clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = trimClip(doc, clipId, 'start', ms(1500));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects trimming the start before the available source', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(1000),
        duration: ms(1000),
        sourceStart: ms(0),
      }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = trimClip(doc, clipId, 'start', ms(500));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects a trim that would overlap a neighbouring clip', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_B, start: ms(2000), duration: ms(1000) }),
    );
    const firstId = doc.tracks[0]!.clips[0]!.id;

    const result = trimClip(doc, firstId, 'end', ms(2500));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('splitClip', () => {
  it('splits one clip into two contiguous clips sharing the source asset', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, {
        trackId: VIDEO,
        assetId: ASSET_A,
        start: ms(0),
        duration: ms(10_000),
        sourceStart: ms(0),
      }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(splitClip(doc, clipId, ms(4000)));
    const clips = doc.tracks[0]!.clips;
    expect(clips).toHaveLength(2);

    expect(clips[0]).toMatchObject({ start: 0, duration: 4000, sourceStart: 0, assetId: ASSET_A });
    expect(clips[1]).toMatchObject({
      start: 4000,
      duration: 6000,
      sourceStart: 4000,
      assetId: ASSET_A,
    });
  });

  it('gives the two halves different ids', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(10_000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    doc = unwrap(splitClip(doc, clipId, ms(4000)));
    const [left, right] = doc.tracks[0]!.clips;
    expect(left!.id).not.toBe(right!.id);
  });

  it('rejects a split point at the clip start', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = splitClip(doc, clipId, ms(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects a split point at or beyond the clip end', () => {
    let doc = createEmptyTimeline();
    doc = unwrap(
      addClip(doc, { trackId: VIDEO, assetId: ASSET_A, start: ms(0), duration: ms(1000) }),
    );
    const clipId = doc.tracks[0]!.clips[0]!.id;

    const result = splitClip(doc, clipId, ms(1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

function unwrap<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got error: ${result.error.message}`);
  return result.value;
}
