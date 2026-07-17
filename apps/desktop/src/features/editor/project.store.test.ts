import { ms, type AssetId } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from './project.store';

const initial = useProjectStore.getState();
const state = () => useProjectStore.getState();
const ASSET = 'asset-a' as AssetId;
const VIDEO = 'video' as never;

beforeEach(() => {
  useProjectStore.setState(initial, true);
});

describe('addClip', () => {
  it('applies a successful add to the document', () => {
    const result = state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });

    expect(result.ok).toBe(true);
    expect(state().document.tracks.find((t) => t.id === 'video')?.clips).toHaveLength(1);
  });

  it('leaves the document untouched when the add fails', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const before = state().document;

    const result = state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(500), duration: ms(1000) });

    expect(result.ok).toBe(false);
    expect(state().document).toBe(before);
  });
});

describe('removeClip', () => {
  it('removes a clip added earlier', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = state().document.tracks[0]!.clips[0]!.id;

    state().removeClip(clipId);
    expect(state().document.tracks[0]?.clips).toHaveLength(0);
  });
});

describe('moveClip / trimClip / splitClip', () => {
  it('moveClip relocates a clip and updates the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = state().document.tracks[0]!.clips[0]!.id;

    const result = state().moveClip(clipId, ms(5000));
    expect(result.ok).toBe(true);
    expect(state().document.tracks[0]?.clips[0]?.start).toBe(5000);
  });

  it('trimClip shortens a clip and updates the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = state().document.tracks[0]!.clips[0]!.id;

    const result = state().trimClip(clipId, 'end', ms(500));
    expect(result.ok).toBe(true);
    expect(state().document.tracks[0]?.clips[0]?.duration).toBe(500);
  });

  it('splitClip produces two clips in the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = state().document.tracks[0]!.clips[0]!.id;

    const result = state().splitClip(clipId, ms(500));
    expect(result.ok).toBe(true);
    expect(state().document.tracks[0]?.clips).toHaveLength(2);
  });
});

describe('reset', () => {
  it('discards all clips and restores a fresh empty timeline', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });

    state().reset();
    expect(state().document.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });
});
