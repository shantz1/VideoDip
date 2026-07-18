import { ms, type AssetId, type TrackId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { addClip, createTimeline, createTrack } from '../document/document.service.js';
import { createDeterministicTimelineIdProvider } from '../identity/identity.service.js';
import { createTimelineRuntimeIndex } from './runtime-index.service.js';

describe('timeline runtime index', () => {
  it('maps every persisted identity without changing the document', () => {
    const trackId = 'video' as TrackId;
    const empty = createTimeline([createTrack({ id: trackId, kind: 'video', label: 'Video' })]);
    const added = addClip(
      empty,
      {
        trackId,
        assetId: 'asset-a' as AssetId,
        start: ms(0),
        duration: ms(1000),
      },
      createDeterministicTimelineIdProvider('index'),
    );
    if (!added.ok) throw new Error(added.error.message);

    const indexed = createTimelineRuntimeIndex(added.value);
    if (!indexed.ok) throw new Error(indexed.error.message);
    expect(indexed.value.tracksById.get(trackId)).toBe(added.value.tracks[0]);
    expect(indexed.value.clipsById.get('index-clip-1' as never)).toBe(
      added.value.tracks[0]?.clips[0],
    );
    expect(JSON.stringify(added.value)).not.toContain('clipsById');
  });

  it('rejects duplicate IDs instead of overwriting an index entry', () => {
    const first = createTrack({ id: 'duplicate' as TrackId, kind: 'video', label: 'Video' });
    const malformed = createTimeline([
      first,
      { ...first, kind: 'audio', label: 'Audio', clips: [] },
    ]);

    expect(createTimelineRuntimeIndex(malformed).ok).toBe(false);
  });
});
