import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms, type SegmentId } from '@videodip/shared';
import {
  getSelectedClipId,
  getSelectedTransitionId,
  getSessionTrackView,
} from '@videodip/timeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import {
  calculateAnchoredScrollLeft,
  calculateFitZoom,
  trackColorClass,
} from '../lib/timeline-presentation';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';
import { TimelinePanel } from './timeline-panel';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSession = useSessionStore.getState();
const initialSubtitle = useSubtitleStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSessionStore.setState(initialSession, true);
  useSubtitleStore.setState(initialSubtitle, true);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('timeline presentation', () => {
  it('uses generated semantic background utilities for visible core clips', () => {
    expect(trackColorClass('video')).toBe('bg-track-video');
    expect(trackColorClass('audio')).toBe('bg-track-audio');
    expect(trackColorClass('subtitle')).toBe('bg-track-subtitle');
  });

  it('gives plugin-defined tracks a visible semantic fallback', () => {
    expect(trackColorClass('plugin:mask')).toBe('bg-accent');
  });

  it('fits content duration to the measured viewport width', () => {
    expect(calculateFitZoom(1_200, ms(30_000))).toBe(40);
  });

  it('uses the minimum empty-canvas duration when fitting short projects', () => {
    expect(calculateFitZoom(1_000, ms(2_000))).toBe(100);
  });

  it('keeps the time under the pointer anchored while zooming', () => {
    // At 50 px/s, scroll 200 + pointer 300 is second 10. At 100 px/s,
    // second 10 must remain under pointer 300, requiring scroll 700.
    expect(calculateAnchoredScrollLeft(200, 300, 50, 100)).toBe(700);
  });

  it('never asks the viewport to scroll before the timeline start', () => {
    expect(calculateAnchoredScrollLeft(0, 20, 100, 5)).toBe(0);
  });
});

describe('track controls', () => {
  it('persists mute and lock through undoable project edits', () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Mute Video track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock Video track' }));

    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video'),
    ).toMatchObject({ isMuted: true, isLocked: true });
    expect(useProjectStore.getState().past.at(-1)?.label).toBe('Lock track');

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video'),
    ).toMatchObject({ isMuted: true, isLocked: false });
  });

  it('keeps collapse and row height in the editing session only', () => {
    render(<TimelinePanel />);
    const videoTrack = useProjectStore
      .getState()
      .document.tracks.find((track) => track.kind === 'video');
    if (!videoTrack) throw new Error('Expected video track.');

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Video track' }), {
      key: 'ArrowDown',
    });
    expect(getSessionTrackView(useSessionStore.getState().session, videoTrack.id).rowHeight).toBe(
      48,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Video track' }));
    expect(getSessionTrackView(useSessionStore.getState().session, videoTrack.id).isCollapsed).toBe(
      true,
    );
    expect(useProjectStore.getState().document.tracks[1]).not.toHaveProperty('rowHeight');
  });

  it('disables destructive clip actions while its track is locked', () => {
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as never,
      start: ms(0),
      duration: ms(1000),
    });
    render(<TimelinePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock Video track' }));
    const clip = screen.getByRole('button', { name: /Unknown clip/ });
    fireEvent.contextMenu(clip, { clientX: 100, clientY: 100 });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
  });
});

describe('timeline context menu', () => {
  it('right-clicking a clip opens a menu with Split and Delete', () => {
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as never,
      start: ms(0),
      duration: ms(1000),
    });
    render(<TimelinePanel />);
    const clip = screen.getByRole('button', { name: /Unknown clip/ });

    fireEvent.contextMenu(clip, { clientX: 100, clientY: 100 });

    const menu = screen.getByRole('menu', { name: 'Timeline item actions' });
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Split at playhead' })).toBeDisabled();
  });

  it('deletes the clip via the context menu and closes the menu', () => {
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as never,
      start: ms(0),
      duration: ms(1000),
    });
    render(<TimelinePanel />);
    const clip = screen.getByRole('button', { name: /Unknown clip/ });

    fireEvent.contextMenu(clip, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips,
    ).toHaveLength(0);
    expect(screen.queryByRole('menu', { name: 'Timeline item actions' })).not.toBeInTheDocument();
  });

  it('closes the context menu on Escape', () => {
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as never,
      start: ms(0),
      duration: ms(1000),
    });
    render(<TimelinePanel />);
    const clip = screen.getByRole('button', { name: /Unknown clip/ });

    fireEvent.contextMenu(clip, { clientX: 100, clientY: 100 });
    expect(screen.getByRole('menu', { name: 'Timeline item actions' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Timeline item actions' })).not.toBeInTheDocument();
  });

  it('bulk-deletes every selected clip when right-clicking a member of the selection', () => {
    const items = ['First', 'Second'].map((name) =>
      createMediaItem({
        locator: mediaLocatorSchema.parse(`opaque:${name.toLowerCase()}`),
        name: `${name}.mp4`,
        kind: 'video',
      }),
    );
    useEditorStore.setState({ mediaItems: items });
    items.forEach((item, index) => {
      useProjectStore.getState().addClip({
        trackId: 'video' as never,
        assetId: item.id,
        start: ms(index * 2000),
        duration: ms(1000),
      });
    });
    render(<TimelinePanel />);
    const first = screen.getByRole('button', { name: /^First\.mp4,/ });
    const second = screen.getByRole('button', { name: /^Second\.mp4,/ });
    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });

    fireEvent.contextMenu(first, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete 2 clips' }));

    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips,
    ).toHaveLength(0);
  });

  it('right-clicking a subtitle cue opens a menu with Split and Delete', () => {
    const added = useSubtitleStore.getState().add({
      id: 'cue-a' as SegmentId,
      start: ms(0),
      end: ms(1000),
      text: 'cue-a',
    });
    if (!added.ok) throw new Error(added.error.message);
    render(<TimelinePanel />);
    const cue = screen.getByRole('button', { name: 'cue-a, 1.00 seconds' });

    fireEvent.contextMenu(cue, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(useSubtitleStore.getState().document.segments).toHaveLength(0);
  });
});

describe('fit timeline to view', () => {
  beforeEach(() => {
    // jsdom does no real layout, so clientWidth is 0 by default and the Fit
    // button stays disabled; give the viewport a deterministic measured width.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1024,
    });
  });

  it('fits to a trailing subtitle cue that ends after the last clip', () => {
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: 'asset-a' as never,
      start: ms(0),
      duration: ms(1000),
    });
    const added = useSubtitleStore.getState().add({
      id: 'cue-a' as SegmentId,
      start: ms(9000),
      end: ms(29_000),
      text: 'trailing cue',
    });
    if (!added.ok) throw new Error(added.error.message);
    render(<TimelinePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Fit timeline to view' }));

    // Clip-only duration is 1s; the real content span is 29s (the subtitle).
    // A zoom fit to the clip alone would be far larger than this.
    expect(useSessionStore.getState().session.viewport.zoom).toBeCloseTo(
      calculateFitZoom(1024, ms(29_000)),
    );
  });
});

describe('playhead scrubbing', () => {
  beforeEach(() => {
    // jsdom has no pointer-capture implementation; the handlers gate on it.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
    useSessionStore.getState().setZoom(100);
    useEditorStore.getState().setProjectDuration(ms(60_000));
  });

  it('scrubs while dragging across the ruler, not only on the initial press', () => {
    render(<TimelinePanel />);
    const ruler = screen.getByRole('slider', { name: 'Playhead position' });

    fireEvent.pointerDown(ruler, { clientX: 50, pointerId: 1 });
    expect(useEditorStore.getState().playhead).toBe(500);

    fireEvent.pointerMove(ruler, { clientX: 150, pointerId: 1 });
    expect(useEditorStore.getState().playhead).toBe(1500);
  });

  it('drags the playhead line itself', () => {
    const { container } = render(<TimelinePanel />);
    const handle = container.querySelector('.cursor-ew-resize');
    if (handle === null) throw new Error('Expected the playhead drag handle.');

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, pointerId: 1 });
    expect(useEditorStore.getState().playhead).toBe(2500);
  });

  it('nudges the playhead from the keyboard on the ruler slider', () => {
    render(<TimelinePanel />);
    const ruler = screen.getByRole('slider', { name: 'Playhead position' });

    fireEvent.keyDown(ruler, { key: 'ArrowRight' });
    expect(useEditorStore.getState().playhead).toBe(100);

    fireEvent.keyDown(ruler, { key: 'ArrowRight', shiftKey: true });
    expect(useEditorStore.getState().playhead).toBe(1100);

    fireEvent.keyDown(ruler, { key: 'ArrowLeft' });
    expect(useEditorStore.getState().playhead).toBe(1000);
  });
});

describe('multi-select', () => {
  function renderThreeClips() {
    const items = ['First', 'Second', 'Third'].map((name) =>
      createMediaItem({
        locator: mediaLocatorSchema.parse(`opaque:${name.toLowerCase()}`),
        name: `${name}.mp4`,
        kind: 'video',
      }),
    );
    useEditorStore.setState({ mediaItems: items });
    items.forEach((item, index) => {
      useProjectStore.getState().addClip({
        trackId: 'video' as never,
        assetId: item.id,
        start: ms(index * 2000),
        duration: ms(1000),
      });
    });
    render(<TimelinePanel />);
    return items.map((item) => screen.getByRole('button', { name: new RegExp(`^${item.name},`) }));
  }

  it('ctrl/cmd+click toggles clips into and out of the selection', () => {
    const [first, second] = renderThreeClips();
    if (!first || !second) throw new Error('Expected clip buttons.');

    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });
    expect(useSessionStore.getState().session.selection.refs).toHaveLength(2);

    fireEvent.click(first, { ctrlKey: true });
    expect(useSessionStore.getState().session.selection.refs).toHaveLength(1);
    expect(getSelectedClipId(useSessionStore.getState().session)).not.toBeNull();
  });

  it('shift+click range-selects between the anchor and the clicked clip', () => {
    const [first, , third] = renderThreeClips();
    if (!first || !third) throw new Error('Expected clip buttons.');

    fireEvent.click(first);
    fireEvent.click(third, { shiftKey: true });

    expect(useSessionStore.getState().session.selection.refs).toHaveLength(3);
  });

  it('deletes every selected clip through the toolbar in one action', () => {
    const [first, second] = renderThreeClips();
    if (!first || !second) throw new Error('Expected clip buttons.');

    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: /Delete 2 selected clips/ }));

    expect(
      useProjectStore.getState().document.tracks.find((track) => track.kind === 'video')?.clips,
    ).toHaveLength(1);
    expect(useSessionStore.getState().session.selection.refs).toHaveLength(0);
  });
});

describe('subtitle multi-select', () => {
  function renderThreeSubtitles() {
    for (const [index, id] of ['cue-a', 'cue-b', 'cue-c'].entries()) {
      const result = useSubtitleStore.getState().add({
        id: id as SegmentId,
        start: ms(index * 2000),
        end: ms(index * 2000 + 1000),
        text: id,
      });
      if (!result.ok) throw new Error(result.error.message);
    }
    useSessionStore.getState().clearSelection();
    render(<TimelinePanel />);
    return ['cue-a', 'cue-b', 'cue-c'].map((id) =>
      screen.getByRole('button', { name: `${id}, 1.00 seconds` }),
    );
  }

  it('ctrl/cmd+click toggles subtitle cues into a type-exclusive selection', () => {
    const [first, second] = renderThreeSubtitles();
    if (!first || !second) throw new Error('Expected subtitle cue buttons.');

    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });

    expect(useSessionStore.getState().session.selection.refs).toEqual([
      { type: 'subtitle-segment', id: 'cue-a' },
      { type: 'subtitle-segment', id: 'cue-b' },
    ]);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });

  it('shift+click range-selects subtitle cues in timeline order', () => {
    const [first, , third] = renderThreeSubtitles();
    if (!first || !third) throw new Error('Expected subtitle cue buttons.');

    fireEvent.click(first);
    fireEvent.click(third, { shiftKey: true });

    expect(useSessionStore.getState().session.selection.refs).toHaveLength(3);
  });

  it('deletes every selected subtitle cue through the toolbar in one action', () => {
    const [first, second] = renderThreeSubtitles();
    if (!first || !second) throw new Error('Expected subtitle cue buttons.');
    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 selected subtitles' }));

    expect(useSubtitleStore.getState().document.segments.map((segment) => segment.id)).toEqual([
      'cue-c',
    ]);
    expect(useSessionStore.getState().session.selection.refs).toHaveLength(0);
  });
});

describe('subtitle move/trim', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
    Element.prototype.releasePointerCapture = vi.fn();
    useSessionStore.getState().setZoom(100);
    useSessionStore.getState().toggleSnapping(); // disable snapping for exact pixel math
  });

  function renderOneSubtitle() {
    const result = useSubtitleStore.getState().add({
      id: 'cue-a' as SegmentId,
      start: ms(0),
      end: ms(1000),
      text: 'cue-a',
    });
    if (!result.ok) throw new Error(result.error.message);
    const { container } = render(<TimelinePanel />);
    const cue = screen.getByRole('button', { name: 'cue-a, 1.00 seconds' });
    return { cue, container };
  }

  it('drags a subtitle cue to a new start time', () => {
    const { cue } = renderOneSubtitle();

    fireEvent.pointerDown(cue, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(cue, { clientX: 50, pointerId: 1 }); // 100 px/s -> +500ms
    fireEvent.pointerUp(cue, { clientX: 50, pointerId: 1 });

    const segment = useSubtitleStore.getState().document.segments[0];
    expect(segment).toMatchObject({ start: 500, end: 1500 });
  });

  it('trims a subtitle cue by dragging its end edge', () => {
    const { cue, container } = renderOneSubtitle();
    const endHandle = container.querySelector('[data-trim-edge="end"]');
    if (!endHandle) throw new Error('Expected the end trim handle.');

    fireEvent.pointerDown(endHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(cue, { clientX: 150, pointerId: 1 }); // +500ms
    fireEvent.pointerUp(cue, { clientX: 150, pointerId: 1 });

    const segment = useSubtitleStore.getState().document.segments[0];
    expect(segment).toMatchObject({ start: 0, end: 1500 });
  });

  it('trims a subtitle cue by dragging its start edge', () => {
    const { cue, container } = renderOneSubtitle();
    const startHandle = container.querySelector('[data-trim-edge="start"]');
    if (!startHandle) throw new Error('Expected the start trim handle.');

    fireEvent.pointerDown(startHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(cue, { clientX: 30, pointerId: 1 }); // +300ms
    fireEvent.pointerUp(cue, { clientX: 30, pointerId: 1 });

    const segment = useSubtitleStore.getState().document.segments[0];
    expect(segment).toMatchObject({ start: 300, end: 1000 });
  });

  it('rejects a move that would overlap another cue and leaves timing untouched', () => {
    const first = useSubtitleStore.getState().add({
      id: 'cue-a' as SegmentId,
      start: ms(0),
      end: ms(1000),
      text: 'cue-a',
    });
    const second = useSubtitleStore.getState().add({
      id: 'cue-b' as SegmentId,
      start: ms(2000),
      end: ms(3000),
      text: 'cue-b',
    });
    if (!first.ok || !second.ok) throw new Error('Expected both cues to be added.');
    render(<TimelinePanel />);
    const cue = screen.getByRole('button', { name: 'cue-a, 1.00 seconds' });

    fireEvent.pointerDown(cue, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(cue, { clientX: 250, pointerId: 1 }); // would overlap cue-b
    fireEvent.pointerUp(cue, { clientX: 250, pointerId: 1 });

    const segment = useSubtitleStore
      .getState()
      .document.segments.find((candidate) => candidate.id === 'cue-a');
    expect(segment).toMatchObject({ start: 0, end: 1000 });
  });
});

describe('timeline transition cuts', () => {
  it('adds a default transition from the control between touching video clips', async () => {
    const first = createMediaItem({
      locator: mediaLocatorSchema.parse('opaque:first'),
      name: 'First.mp4',
      kind: 'video',
    });
    const second = createMediaItem({
      locator: mediaLocatorSchema.parse('opaque:second'),
      name: 'Second.mp4',
      kind: 'video',
    });
    useEditorStore.setState({ mediaItems: [first, second] });
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: first.id,
      start: ms(0),
      duration: ms(1000),
    });
    useProjectStore.getState().addClip({
      trackId: 'video' as never,
      assetId: second.id,
      start: ms(1000),
      duration: ms(1000),
    });

    const user = userEvent.setup();
    render(<TimelinePanel />);
    await user.click(screen.getByRole('button', { name: 'Add transition between adjacent clips' }));

    expect(useProjectStore.getState().document.transitions[0]).toMatchObject({
      kind: 'crossfade',
      duration: 500,
    });
    expect(useEditorStore.getState().inspectorTab).toBe('effects');
    const session = useSessionStore.getState().session;
    expect(getSelectedClipId(session)).toBeNull();
    expect(getSelectedTransitionId(session)).not.toBeNull();
  });
});
