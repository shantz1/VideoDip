import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms } from '@videodip/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import {
  calculateAnchoredScrollLeft,
  calculateFitZoom,
  trackColorClass,
} from '../lib/timeline-presentation';
import { useProjectStore } from '../project.store';
import { TimelinePanel } from './timeline-panel';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
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

describe('playhead scrubbing', () => {
  beforeEach(() => {
    // jsdom has no pointer-capture implementation; the handlers gate on it.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
    useEditorStore.setState({ zoom: 100 });
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
    expect(useEditorStore.getState()).toMatchObject({
      inspectorTab: 'effects',
      selectedClipId: null,
    });
    expect(useEditorStore.getState().selectedTransitionId).not.toBeNull();
  });
});
