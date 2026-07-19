import type { ClipId, SegmentId, TransitionId } from '@videodip/shared';
import { SESSION_ZOOM_DEFAULT, SESSION_ZOOM_MAX, SESSION_ZOOM_MIN } from '@videodip/timeline';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session.store';

const initial = useSessionStore.getState();
const state = () => useSessionStore.getState();

beforeEach(() => {
  useSessionStore.setState(initial, true);
});

describe('selection', () => {
  it('selects and clears', () => {
    state().select({ type: 'clip', id: 'clip-1' as ClipId });
    const ref = { type: 'clip', id: 'clip-1' };
    expect(state().session.selection).toEqual({ refs: [ref], primary: ref, anchor: ref });

    state().clearSelection();
    expect(state().session.selection).toEqual({ refs: [], primary: null, anchor: null });
  });

  it('does not publish a new session reference for a no-op selection', () => {
    state().select({ type: 'clip', id: 'clip-1' as ClipId });
    const afterFirstSelect = state().session;

    let notifications = 0;
    const unsubscribe = useSessionStore.subscribe(() => {
      notifications += 1;
    });
    state().select({ type: 'clip', id: 'clip-1' as ClipId });
    unsubscribe();

    expect(notifications).toBe(0);
    expect(state().session).toBe(afterFirstSelect);
  });

  it('keeps clip, transition, and subtitle selections mutually exclusive', () => {
    state().select({ type: 'clip', id: 'clip-1' as ClipId });
    expect(state().session.selection.primary).toEqual({ type: 'clip', id: 'clip-1' });

    state().select({ type: 'transition', id: 'transition-1' as TransitionId });
    expect(state().session.selection.primary).toEqual({ type: 'transition', id: 'transition-1' });

    state().select({ type: 'subtitle-segment', id: 'subtitle-1' as SegmentId });
    expect(state().session.selection.primary).toEqual({
      type: 'subtitle-segment',
      id: 'subtitle-1',
    });

    state().select(null);
    expect(state().session.selection).toEqual({ refs: [], primary: null, anchor: null });
  });
});

describe('multi-select', () => {
  const clipA = { type: 'clip', id: 'clip-a' as ClipId } as const;
  const clipB = { type: 'clip', id: 'clip-b' as ClipId } as const;
  const clipC = { type: 'clip', id: 'clip-c' as ClipId } as const;
  const order = [clipA, clipB, clipC];

  it('toggleSelect accumulates and removes refs', () => {
    state().toggleSelect(clipA);
    state().toggleSelect(clipB);
    expect(state().session.selection.refs).toEqual([clipA, clipB]);

    state().toggleSelect(clipA);
    expect(state().session.selection.refs).toEqual([clipB]);
  });

  it('extendSelect range-selects from the anchor', () => {
    state().select(clipA);
    state().extendSelect(clipC, order);
    expect(state().session.selection.refs).toEqual([clipA, clipB, clipC]);
    expect(state().session.selection.primary).toEqual(clipC);
  });

  it('removing the last toggled ref clears the selection entirely', () => {
    state().toggleSelect(clipA);
    state().toggleSelect(clipA);
    expect(state().session.selection).toEqual({ refs: [], primary: null, anchor: null });
  });
});

describe('viewport', () => {
  it('sets, steps, and clamps zoom', () => {
    state().setZoom(200);
    expect(state().session.viewport.zoom).toBe(200);

    state().zoomIn();
    expect(state().session.viewport.zoom).toBeGreaterThan(200);

    state().setZoom(SESSION_ZOOM_MAX + 1000);
    expect(state().session.viewport.zoom).toBe(SESSION_ZOOM_MAX);

    state().setZoom(SESSION_ZOOM_MIN - 1000);
    expect(state().session.viewport.zoom).toBe(SESSION_ZOOM_MIN);
  });

  it('toggles snapping', () => {
    expect(state().session.viewport.isSnappingEnabled).toBe(true);
    state().toggleSnapping();
    expect(state().session.viewport.isSnappingEnabled).toBe(false);
  });
});

describe('clip transform preview', () => {
  it('previews only the selected clip and clears without persistence', () => {
    const clipId = 'clip-1' as ClipId;
    const transform = {
      positionX: 0.1,
      positionY: 0.2,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 0,
    };
    state().select({ type: 'clip', id: clipId });
    state().previewClipTransform(clipId, transform);
    expect(state().session.clipTransformPreview).toEqual({ clipId, transform });

    state().clearClipTransformPreview();
    expect(state().session.clipTransformPreview).toBeNull();
  });
});

describe('resetSession', () => {
  it('clears selection and tool but retains the viewport', () => {
    state().select({ type: 'clip', id: 'clip-1' as ClipId });
    state().setZoom(250);
    state().toggleSnapping();

    state().resetSession();

    expect(state().session.selection).toEqual({ refs: [], primary: null, anchor: null });
    expect(state().session.activeTool).toBe('select');
    expect(state().session.viewport).toEqual({ zoom: 250, isSnappingEnabled: false });
  });

  it('starts with the default zoom before any zoom change', () => {
    expect(state().session.viewport.zoom).toBe(SESSION_ZOOM_DEFAULT);
  });
});
