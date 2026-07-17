import { ms, type AssetId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  addClip,
  createEmptyTimeline,
  findFreeStart,
  getDuration,
  moveClip,
  removeClip,
  splitClip,
  trimClip,
} from './document.service.js';
import type { TrackId } from '@videodip/shared';

const ASSET_A = 'asset-a' as AssetId;
const ASSET_B = 'asset-b' as AssetId;
const VIDEO: TrackId = 'video' as TrackId;
const AUDIO: TrackId = 'audio' as TrackId;

describe('createEmptyTimeline', () => {
  it('creates exactly the three fixed tracks, all empty', () => {
    const doc = createEmptyTimeline();
    expect(doc.tracks.map((t) => t.id)).toEqual(['video', 'subtitle', 'audio']);
    expect(doc.tracks.every((t) => t.clips.length === 0)).toBe(true);
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
