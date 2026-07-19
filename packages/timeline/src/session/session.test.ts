import { ms, type AssetId, type SegmentId, type TrackId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  addClip,
  createTimeline,
  createTrack,
  moveClip,
  removeClip,
} from '../document/document.service.js';
import { createDeterministicTimelineIdProvider } from '../identity/identity.service.js';
import { createTimelineRuntimeIndex } from '../runtime-index/runtime-index.service.js';
import {
  SESSION_ZOOM_DEFAULT,
  SESSION_ZOOM_MAX,
  SESSION_ZOOM_MIN,
  SESSION_ZOOM_STEP,
  clearSessionSelection,
  clearSessionClipTransformPreview,
  createEditingSession,
  extendSessionSelection,
  getSelectedClipId,
  getSelectedSubtitleSegmentId,
  getSelectedTransitionId,
  getSessionClipTransformPreview,
  getSessionSelectedClipIds,
  isSessionRefSelected,
  previewSessionClipTransform,
  reconcileSession,
  selectSessionItem,
  setSessionTool,
  setSessionZoom,
  stepSessionZoom,
  toggleSessionSelection,
  toggleSessionSnapping,
} from './session.service.js';

const VIDEO = 'video' as TrackId;

function timelineWithOneClip() {
  const empty = createTimeline([createTrack({ id: VIDEO, kind: 'video', label: 'Video' })]);
  const ids = createDeterministicTimelineIdProvider('session');
  const added = addClip(
    empty,
    { trackId: VIDEO, assetId: 'asset-a' as AssetId, start: ms(0), duration: ms(1000) },
    ids,
  );
  if (!added.ok) throw new Error(added.error.message);
  return { document: added.value, ids };
}

function timelineWithTwoClips() {
  const { document: oneClip, ids } = timelineWithOneClip();
  const added = addClip(
    oneClip,
    { trackId: VIDEO, assetId: 'asset-b' as AssetId, start: ms(1000), duration: ms(1000) },
    ids,
  );
  if (!added.ok) throw new Error(added.error.message);
  return { document: added.value, ids };
}

describe('createEditingSession', () => {
  it('defaults to nothing selected, default zoom, snapping on, select tool', () => {
    const session = createEditingSession();
    expect(session.selection).toEqual({ refs: [], primary: null, anchor: null });
    expect(session.viewport).toEqual({ zoom: SESSION_ZOOM_DEFAULT, isSnappingEnabled: true });
    expect(session.activeTool).toBe('select');
  });

  it('applies overrides, merging a partial viewport with defaults', () => {
    const session = createEditingSession({
      selection: { type: 'clip', id: 'clip-1' as never },
      viewport: { isSnappingEnabled: false },
    });
    const ref = { type: 'clip', id: 'clip-1' };
    expect(session.selection).toEqual({ refs: [ref], primary: ref, anchor: ref });
    expect(session.viewport).toEqual({ zoom: SESSION_ZOOM_DEFAULT, isSnappingEnabled: false });
  });

  it('falls back to the default zoom for a non-finite override', () => {
    const session = createEditingSession({ viewport: { zoom: Number.NaN } });
    expect(session.viewport.zoom).toBe(SESSION_ZOOM_DEFAULT);
  });
});

describe('selection', () => {
  it('selects a clip and exposes it through the read helper', () => {
    const session = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'clip-1' as never,
    });
    expect(getSelectedClipId(session)).toBe('clip-1');
    expect(getSelectedTransitionId(session)).toBeNull();
    expect(getSelectedSubtitleSegmentId(session)).toBeNull();
  });

  it('selecting a transition replaces a clip selection', () => {
    const withClip = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'clip-1' as never,
    });
    const withTransition = selectSessionItem(withClip, {
      type: 'transition',
      id: 'transition-1' as never,
    });
    expect(getSelectedClipId(withTransition)).toBeNull();
    expect(getSelectedTransitionId(withTransition)).toBe('transition-1');
  });

  it('selecting the same ref by value returns the same session reference', () => {
    const session = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'clip-1' as never,
    });
    const reselected = selectSessionItem(session, { type: 'clip', id: 'clip-1' as never });
    expect(reselected).toBe(session);
  });

  it('clearing selection is a no-op when already clear', () => {
    const session = createEditingSession();
    expect(clearSessionSelection(session)).toBe(session);
  });

  it('clears an existing selection', () => {
    const session = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'clip-1' as never,
    });
    expect(clearSessionSelection(session).selection).toEqual({
      refs: [],
      primary: null,
      anchor: null,
    });
  });
});

describe('toggleSessionSelection', () => {
  const clipA = { type: 'clip', id: 'clip-a' as never } as const;
  const clipB = { type: 'clip', id: 'clip-b' as never } as const;
  const clipC = { type: 'clip', id: 'clip-c' as never } as const;

  it('adds an absent ref, making it primary and anchor', () => {
    const session = toggleSessionSelection(createEditingSession(), clipA);
    expect(session.selection).toEqual({ refs: [clipA], primary: clipA, anchor: clipA });
    expect(isSessionRefSelected(session, clipA)).toBe(true);
  });

  it('accumulates multiple refs in insertion order, primary tracks the latest', () => {
    let session = toggleSessionSelection(createEditingSession(), clipA);
    session = toggleSessionSelection(session, clipB);
    session = toggleSessionSelection(session, clipC);
    expect(session.selection.refs).toEqual([clipA, clipB, clipC]);
    expect(session.selection.primary).toEqual(clipC);
    expect(getSessionSelectedClipIds(session)).toEqual(['clip-a', 'clip-b', 'clip-c']);
  });

  it('removes a present ref, primary falls back to the new last member', () => {
    let session = toggleSessionSelection(createEditingSession(), clipA);
    session = toggleSessionSelection(session, clipB);
    session = toggleSessionSelection(session, clipA);
    expect(session.selection.refs).toEqual([clipB]);
    expect(session.selection.primary).toEqual(clipB);
    expect(isSessionRefSelected(session, clipA)).toBe(false);
  });

  it('removing the last ref clears primary and anchor', () => {
    let session = toggleSessionSelection(createEditingSession(), clipA);
    session = toggleSessionSelection(session, clipA);
    expect(session.selection).toEqual({ refs: [], primary: null, anchor: null });
  });

  it('moves the anchor when the removed ref was the anchor', () => {
    let session = toggleSessionSelection(createEditingSession(), clipA);
    session = toggleSessionSelection(session, clipB); // anchor is now clipB
    session = toggleSessionSelection(session, clipB); // remove the anchor
    expect(session.selection).toEqual({ refs: [clipA], primary: clipA, anchor: clipA });
  });
});

describe('extendSessionSelection', () => {
  const clipA = { type: 'clip', id: 'clip-a' as never } as const;
  const clipB = { type: 'clip', id: 'clip-b' as never } as const;
  const clipC = { type: 'clip', id: 'clip-c' as never } as const;
  const order = [clipA, clipB, clipC];

  it('behaves like a replace-select when there is no anchor yet', () => {
    const session = extendSessionSelection(createEditingSession(), clipB, order);
    expect(session.selection).toEqual({ refs: [clipB], primary: clipB, anchor: clipB });
  });

  it('selects the inclusive range between anchor and the extended ref', () => {
    const anchored = selectSessionItem(createEditingSession(), clipA);
    const extended = extendSessionSelection(anchored, clipC, order);
    expect(extended.selection.refs).toEqual([clipA, clipB, clipC]);
    expect(extended.selection.primary).toEqual(clipC);
    expect(extended.selection.anchor).toEqual(clipA);
  });

  it('extending backward past the anchor still slices in document order', () => {
    const anchored = selectSessionItem(createEditingSession(), clipC);
    const extended = extendSessionSelection(anchored, clipA, order);
    expect(extended.selection.refs).toEqual([clipA, clipB, clipC]);
    expect(extended.selection.anchor).toEqual(clipC);
  });

  it('repeated range-extends keep the same anchor', () => {
    const anchored = selectSessionItem(createEditingSession(), clipA);
    const first = extendSessionSelection(anchored, clipB, order);
    const second = extendSessionSelection(first, clipC, order);
    expect(second.selection.anchor).toEqual(clipA);
    expect(second.selection.refs).toEqual([clipA, clipB, clipC]);
  });

  it('falls back to a replace-select when the anchor is absent from orderedRefs', () => {
    const transition = { type: 'transition', id: 'transition-1' as never } as const;
    const anchored = selectSessionItem(createEditingSession(), transition);
    const extended = extendSessionSelection(anchored, clipB, order);
    expect(extended.selection).toEqual({ refs: [clipB], primary: clipB, anchor: clipB });
  });
});

describe('clip transform preview', () => {
  const transform = {
    positionX: 0.1,
    positionY: -0.2,
    scaleX: 1.25,
    scaleY: 1.25,
    rotation: 0,
  };

  it('only previews the selected clip and ignores duplicate transforms', () => {
    const empty = createEditingSession();
    expect(previewSessionClipTransform(empty, 'clip-1' as never, transform)).toBe(empty);

    const selected = selectSessionItem(empty, { type: 'clip', id: 'clip-1' as never });
    const previewed = previewSessionClipTransform(selected, 'clip-1' as never, transform);
    expect(getSessionClipTransformPreview(previewed, 'clip-1' as never)?.transform).toEqual(
      transform,
    );
    expect(previewSessionClipTransform(previewed, 'clip-1' as never, transform)).toBe(previewed);
  });

  it('clears the preview explicitly or when selection changes', () => {
    const selected = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'clip-1' as never,
    });
    const previewed = previewSessionClipTransform(selected, 'clip-1' as never, transform);
    expect(clearSessionClipTransformPreview(previewed).clipTransformPreview).toBeNull();

    const changed = selectSessionItem(previewed, {
      type: 'transition',
      id: 'transition-1' as never,
    });
    expect(changed.clipTransformPreview).toBeNull();
  });
});

describe('viewport', () => {
  it('clamps zoom below the minimum and above the maximum', () => {
    expect(setSessionZoom(createEditingSession(), 0).viewport.zoom).toBe(SESSION_ZOOM_MIN);
    expect(setSessionZoom(createEditingSession(), 10_000).viewport.zoom).toBe(SESSION_ZOOM_MAX);
  });

  it('ignores non-finite zoom and returns the same reference', () => {
    const session = createEditingSession();
    expect(setSessionZoom(session, Number.NaN)).toBe(session);
    expect(setSessionZoom(session, Number.POSITIVE_INFINITY)).toBe(session);
    expect(setSessionZoom(session, Number.NEGATIVE_INFINITY)).toBe(session);
  });

  it('steps zoom multiplicatively in and out, clamped at bounds', () => {
    const session = createEditingSession();
    const zoomedIn = stepSessionZoom(session, 'in');
    expect(zoomedIn.viewport.zoom).toBeCloseTo(SESSION_ZOOM_DEFAULT * SESSION_ZOOM_STEP);

    const atMax = setSessionZoom(session, SESSION_ZOOM_MAX);
    expect(stepSessionZoom(atMax, 'in')).toBe(atMax);

    const atMin = setSessionZoom(session, SESSION_ZOOM_MIN);
    expect(stepSessionZoom(atMin, 'out')).toBe(atMin);
  });

  it('toggles snapping on and off', () => {
    const session = createEditingSession();
    const toggled = toggleSessionSnapping(session);
    expect(toggled.viewport.isSnappingEnabled).toBe(false);
    expect(toggleSessionSnapping(toggled).viewport.isSnappingEnabled).toBe(true);
  });

  it('setting the same tool returns the same reference', () => {
    const session = createEditingSession();
    expect(setSessionTool(session, 'select')).toBe(session);
  });
});

describe('reconcileSession', () => {
  it('is a no-op when nothing is selected', () => {
    const session = createEditingSession();
    const { document } = timelineWithOneClip();
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    expect(reconcileSession(session, index.value)).toBe(session);
  });

  it('keeps a selection referencing a live clip', () => {
    const { document } = timelineWithOneClip();
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    const session = selectSessionItem(createEditingSession(), { type: 'clip', id: clipId });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    expect(reconcileSession(session, index.value)).toBe(session);
  });

  it('clears a selection referencing a removed clip', () => {
    const { document } = timelineWithOneClip();
    const session = selectSessionItem(createEditingSession(), {
      type: 'clip',
      id: 'missing-clip' as never,
    });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    const reconciled = reconcileSession(session, index.value);
    expect(reconciled.selection).toEqual({ refs: [], primary: null, anchor: null });
  });

  it('clears a selection referencing a removed transition', () => {
    const { document } = timelineWithOneClip();
    const session = selectSessionItem(createEditingSession(), {
      type: 'transition',
      id: 'missing-transition' as never,
    });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    expect(reconcileSession(session, index.value).selection).toEqual({
      refs: [],
      primary: null,
      anchor: null,
    });
  });

  it('preserves a subtitle-segment selection when no guard is supplied', () => {
    const { document } = timelineWithOneClip();
    const session = selectSessionItem(createEditingSession(), {
      type: 'subtitle-segment',
      id: 'segment-1' as SegmentId,
    });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    expect(reconcileSession(session, index.value)).toBe(session);
  });

  it('clears a subtitle-segment selection when the guard reports it missing', () => {
    const { document } = timelineWithOneClip();
    const session = selectSessionItem(createEditingSession(), {
      type: 'subtitle-segment',
      id: 'segment-1' as SegmentId,
    });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    const reconciled = reconcileSession(session, index.value, {
      hasSubtitleSegment: () => false,
    });
    expect(reconciled.selection).toEqual({ refs: [], primary: null, anchor: null });
  });

  it('keeps a subtitle-segment selection when the guard reports it present', () => {
    const { document } = timelineWithOneClip();
    const session = selectSessionItem(createEditingSession(), {
      type: 'subtitle-segment',
      id: 'segment-1' as SegmentId,
    });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    const reconciled = reconcileSession(session, index.value, {
      hasSubtitleSegment: () => true,
    });
    expect(reconciled).toBe(session);
  });

  it('clearing a stale selection preserves viewport and tool', () => {
    const { document } = timelineWithOneClip();
    const zoomed = setSessionZoom(createEditingSession(), 200);
    const session = selectSessionItem(zoomed, { type: 'clip', id: 'missing-clip' as never });
    const index = createTimelineRuntimeIndex(document);
    if (!index.ok) throw new Error(index.error.message);
    const reconciled = reconcileSession(session, index.value);
    expect(reconciled.selection).toEqual({ refs: [], primary: null, anchor: null });
    expect(reconciled.viewport).toEqual(session.viewport);
    expect(reconciled.activeTool).toBe(session.activeTool);
  });

  it('returns the same reference for an unrelated document change', () => {
    const { document } = timelineWithOneClip();
    const clipId = document.tracks[0]?.clips[0]?.id;
    if (!clipId) throw new Error('Expected a clip.');
    const session = selectSessionItem(createEditingSession(), { type: 'clip', id: clipId });

    const moved = moveClip(document, clipId, ms(2000));
    if (!moved.ok) throw new Error(moved.error.message);
    const index = createTimelineRuntimeIndex(moved.value);
    if (!index.ok) throw new Error(index.error.message);

    expect(reconcileSession(session, index.value)).toBe(session);
  });

  it('drops only the removed member from a multi-item selection, primary falls back', () => {
    const { document } = timelineWithTwoClips();
    const [clipA, clipB] = document.tracks[0]?.clips ?? [];
    if (!clipA || !clipB) throw new Error('Expected two clips.');

    let session = toggleSessionSelection(createEditingSession(), { type: 'clip', id: clipA.id });
    session = toggleSessionSelection(session, { type: 'clip', id: clipB.id });
    expect(session.selection.primary).toEqual({ type: 'clip', id: clipB.id });

    const withoutB = removeClip(document, clipB.id);
    const index = createTimelineRuntimeIndex(withoutB);
    if (!index.ok) throw new Error(index.error.message);

    const reconciled = reconcileSession(session, index.value);
    expect(reconciled.selection).toEqual({
      refs: [{ type: 'clip', id: clipA.id }],
      primary: { type: 'clip', id: clipA.id },
      anchor: { type: 'clip', id: clipA.id },
    });
  });
});
