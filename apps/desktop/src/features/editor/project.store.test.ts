import { ms, normalized, type AssetId } from '@videodip/shared';
import { getSelectedClipId, getSelectedTransitionId } from '@videodip/timeline';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor.store';
import { useProjectStore } from './project.store';
import { useSessionStore } from './session.store';

const initial = useProjectStore.getState();
const initialEditor = useEditorStore.getState();
const initialSession = useSessionStore.getState();
const state = () => useProjectStore.getState();
const session = () => useSessionStore.getState();
const ASSET = 'asset-a' as AssetId;
const VIDEO = 'video' as never;
const videoClips = () => state().document.tracks.find((track) => track.kind === 'video')?.clips;

beforeEach(() => {
  useProjectStore.setState(initial, true);
  useEditorStore.setState(initialEditor, true);
  useSessionStore.setState(initialSession, true);
});

describe('addClip', () => {
  it('applies a successful add to the document', () => {
    const result = state().addClip({
      trackId: VIDEO,
      assetId: ASSET,
      start: ms(0),
      duration: ms(1000),
    });

    expect(result.ok).toBe(true);
    expect(videoClips()).toHaveLength(1);
  });

  it('leaves the document untouched when the add fails', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const before = state().document;

    const result = state().addClip({
      trackId: VIDEO,
      assetId: ASSET,
      start: ms(500),
      duration: ms(1000),
    });

    expect(result.ok).toBe(false);
    expect(state().document).toBe(before);
  });
});

describe('generic tracks', () => {
  it('adds, reorders, and removes arbitrary track kinds through undoable state', () => {
    const added = state().addTrack({ kind: 'plugin:overlay', label: 'Plugin overlay' }, 0);
    expect(added.ok).toBe(true);
    const track = state().document.tracks[0]!;
    expect(track.kind).toBe('plugin:overlay');

    expect(state().reorderTrack(track.id, 2).ok).toBe(true);
    expect(state().document.tracks[2]?.id).toBe(track.id);

    expect(state().removeTrack(track.id).ok).toBe(true);
    expect(state().document.tracks.some((candidate) => candidate.id === track.id)).toBe(false);
    expect(state().past.length).toBeGreaterThanOrEqual(3);
  });

  it('stores track state as one undoable planner transaction', () => {
    const before = state().document.tracks.find((track) => track.kind === 'video');
    if (!before) throw new Error('Expected video track.');
    expect(state().updateTrackState(before.id, { isMuted: true, isLocked: true }).ok).toBe(true);
    expect(state().document.tracks.find((track) => track.id === before.id)).toMatchObject({
      isMuted: true,
      isLocked: true,
    });
    expect(state().past.at(-1)?.label).toBe('Lock track');

    state().undo();
    expect(state().document.tracks.find((track) => track.id === before.id)).toMatchObject({
      isMuted: false,
      isLocked: false,
    });
  });
});

describe('removeClip', () => {
  it('removes a clip added earlier', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    state().removeClip(clipId);
    expect(videoClips()).toHaveLength(0);
  });
});

describe('removeClips', () => {
  it('removes every listed clip in a single undo entry', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(2000), duration: ms(1000) });
    const [a, b] = videoClips() ?? [];
    if (!a || !b) throw new Error('Expected two clips.');
    const pastBefore = state().past.length;

    state().removeClips([a.id, b.id]);

    expect(videoClips()).toHaveLength(0);
    expect(state().past.length).toBe(pastBefore + 1);
  });

  it('is a no-op for an empty list', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const before = state().document;

    state().removeClips([]);

    expect(state().document).toBe(before);
  });
});

describe('transitions', () => {
  it('adds, updates, removes, and undoes a transition relation', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(1000), duration: ms(1000) });
    const [from, to] = videoClips() ?? [];
    if (!from || !to) throw new Error('Expected adjacent clips.');

    const added = state().addTransition({
      fromClipId: from.id,
      toClipId: to.id,
      kind: 'crossfade',
      duration: ms(250),
    });
    expect(added.ok).toBe(true);
    const transition = state().document.transitions[0];
    if (!transition) throw new Error('Expected a transition.');

    expect(state().updateTransition(transition.id, { kind: 'wipe-left' }).ok).toBe(true);
    expect(state().document.transitions[0]?.kind).toBe('wipe-left');
    state().undo();
    expect(state().document.transitions[0]?.kind).toBe('crossfade');

    state().removeTransition(transition.id);
    expect(state().document.transitions).toEqual([]);
  });
});

describe('moveClip / trimClip / splitClip', () => {
  it('moveClip relocates a clip and updates the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    const result = state().moveClip(clipId, ms(5000));
    expect(result.ok).toBe(true);
    expect(videoClips()?.[0]?.start).toBe(5000);
  });

  it('trimClip shortens a clip and updates the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    const result = state().trimClip(clipId, 'end', ms(500));
    expect(result.ok).toBe(true);
    expect(videoClips()?.[0]?.duration).toBe(500);
  });

  it('splitClip produces two clips in the document', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    const result = state().splitClip(clipId, ms(500));
    expect(result.ok).toBe(true);
    expect(videoClips()).toHaveLength(2);
  });
});

describe('updateClipProperties', () => {
  it('applies visual edits through undo/redo history', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    const result = state().updateClipProperties(clipId, {
      transform: { rotation: 20 },
      opacity: normalized(0.75),
    });
    expect(result.ok).toBe(true);
    expect(videoClips()?.[0]).toMatchObject({
      transform: { rotation: 20 },
      opacity: 0.75,
    });

    state().undo();
    expect(videoClips()?.[0]).toMatchObject({
      transform: { rotation: 0 },
      opacity: 1,
    });
  });
});

describe('setClipAnimation', () => {
  it('stores keyframes as an undoable document edit', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;

    const result = state().setClipAnimation(clipId, [
      { property: 'opacity', offset: ms(0), value: 0, easing: 'linear' },
      { property: 'opacity', offset: ms(500), value: 1, easing: 'ease-out' },
    ]);
    expect(result.ok).toBe(true);
    expect(videoClips()?.[0]?.animation).toHaveLength(2);

    state().undo();
    expect(videoClips()?.[0]?.animation).toEqual([]);
  });
});

describe('updateClipAudio', () => {
  it('stores audio mix changes as undoable edits', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    expect(state().updateClipAudio(clipId, { volume: normalized(0.5), fadeIn: ms(200) }).ok).toBe(
      true,
    );
    expect(videoClips()?.[0]?.audio).toMatchObject({ volume: 0.5, fadeIn: 200 });
    state().undo();
    expect(videoClips()?.[0]?.audio).toMatchObject({ volume: 1, fadeIn: 0 });
  });
});

describe('reset', () => {
  it('discards all clips and restores a fresh empty timeline', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });

    state().reset();
    expect(state().document.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });
});

describe('load', () => {
  it('restores a saved document without dirtying it or retaining undo history', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const persisted = state().document;
    state().removeClip(persisted.tracks.find((track) => track.kind === 'video')!.clips[0]!.id);
    useEditorStore.setState({ isDirty: false, editRevision: 0 });

    state().load(persisted);

    expect(videoClips()).toHaveLength(1);
    expect(state().past).toEqual([]);
    expect(state().future).toEqual([]);
    expect(useEditorStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState().duration).toBe(1000);
  });
});

describe('undo / redo', () => {
  it('undoes and reapplies document edits', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    expect(state().past).toHaveLength(1);
    expect(state().past[0]?.label).toBe('Add clip');

    state().undo();
    expect(videoClips()).toHaveLength(0);
    expect(state().future).toHaveLength(1);

    state().redo();
    expect(videoClips()).toHaveLength(1);
  });

  it('clears redo history when a new edit follows undo', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    state().undo();
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(2000), duration: ms(1000) });

    expect(state().future).toHaveLength(0);
  });

  it('clears history for a new project', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    state().reset();

    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
  });
});

describe('editing session reconciliation', () => {
  it('clears a clip selection when the project is reset', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    session().select({ type: 'clip', id: clipId });
    session().setZoom(250);

    state().reset();

    expect(getSelectedClipId(session().session)).toBeNull();
    expect(session().session.viewport.zoom).toBe(250);
  });

  it('clears a clip selection when the selected clip is removed', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    session().select({ type: 'clip', id: clipId });
    expect(getSelectedClipId(session().session)).toBe(clipId);

    state().removeClip(clipId);
    expect(getSelectedClipId(session().session)).toBeNull();
  });

  it('does not resurrect a cleared selection on redo', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    session().select({ type: 'clip', id: clipId });

    state().undo();
    expect(getSelectedClipId(session().session)).toBeNull();

    state().redo();
    expect(getSelectedClipId(session().session)).toBeNull();
  });

  it('clears a transition selection when moving an endpoint drops the transition', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(1000), duration: ms(1000) });
    const [from, to] = videoClips() ?? [];
    if (!from || !to) throw new Error('Expected adjacent clips.');
    const added = state().addTransition({
      fromClipId: from.id,
      toClipId: to.id,
      kind: 'crossfade',
      duration: ms(250),
    });
    if (!added.ok) throw new Error('Expected the transition to be added.');
    const transitionId = state().document.transitions[0]!.id;
    session().select({ type: 'transition', id: transitionId });

    state().moveClip(to.id, ms(5000));
    expect(getSelectedTransitionId(session().session)).toBeNull();
  });

  it('clears a stale clip selection on load and retains the viewport', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    session().select({ type: 'clip', id: clipId });
    session().setZoom(250);

    const documentWithoutTheClip = initial.document;
    state().load(documentWithoutTheClip);

    expect(getSelectedClipId(session().session)).toBeNull();
    expect(session().session.viewport.zoom).toBe(250);
  });

  it('preserves the original clip id selection across a split', () => {
    state().addClip({ trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) });
    const clipId = videoClips()![0]!.id;
    session().select({ type: 'clip', id: clipId });

    const result = state().splitClip(clipId, ms(500));
    expect(result.ok).toBe(true);
    expect(getSelectedClipId(session().session)).toBe(clipId);
  });
});
