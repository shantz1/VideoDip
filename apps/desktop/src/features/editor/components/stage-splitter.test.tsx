import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { StageSplitter } from './stage-splitter';

const initial = useEditorStore.getState();

function renderInPane() {
  const view = render(
    <div>
      <StageSplitter />
    </div>,
  );
  const pane = view.container.firstElementChild;
  if (!(pane instanceof HTMLElement)) throw new Error('Expected the pane wrapper.');
  // jsdom rects are all zeros; the splitter reads the pane's right edge.
  pane.getBoundingClientRect = () => ({ left: 600, right: 1000, width: 400 }) as DOMRect;
  return screen.getByRole('separator', { name: 'Resize video stage' });
}

beforeEach(() => {
  useEditorStore.setState(initial, true);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
});

describe('StageSplitter', () => {
  it('resizes the stage pane while dragging', () => {
    const splitter = renderInPane();

    fireEvent.pointerDown(splitter, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 700, pointerId: 1 });
    // Pane right edge is 1000; pointer at 700 leaves a 300px stage.
    expect(useEditorStore.getState().stagePaneWidth).toBe(300);

    fireEvent.pointerMove(splitter, { clientX: 550, pointerId: 1 });
    expect(useEditorStore.getState().stagePaneWidth).toBe(450);
  });

  it('never squeezes the tools past sixty percent of the window', () => {
    const splitter = renderInPane();
    fireEvent.pointerDown(splitter, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 0, pointerId: 1 });
    expect(useEditorStore.getState().stagePaneWidth).toBe(960);
  });

  it('resizes from the keyboard and resets with Home', () => {
    const splitter = renderInPane();

    // No stored width yet: the first step starts from the measured pane.
    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(useEditorStore.getState().stagePaneWidth).toBe(416);

    fireEvent.keyDown(splitter, { key: 'ArrowRight', shiftKey: true });
    expect(useEditorStore.getState().stagePaneWidth).toBe(352);

    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(useEditorStore.getState().stagePaneWidth).toBeNull();
  });

  it('resets to the layout default on double-click', () => {
    const splitter = renderInPane();
    useEditorStore.getState().setStagePaneWidth(500);
    fireEvent.doubleClick(splitter);
    expect(useEditorStore.getState().stagePaneWidth).toBeNull();
  });
});
