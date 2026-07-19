import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { TimelinePaneSplitter } from './timeline-pane-splitter';

const initial = useEditorStore.getState();

function renderSplitter() {
  const view = render(
    <div>
      <TimelinePaneSplitter />
    </div>,
  );
  const wrapper = view.container.firstElementChild;
  if (!(wrapper instanceof HTMLElement)) throw new Error('Expected timeline wrapper.');
  wrapper.getBoundingClientRect = () => ({ top: 600, bottom: 1000, height: 400 }) as DOMRect;
  return screen.getByRole('separator', { name: 'Resize timeline' });
}

beforeEach(() => {
  useEditorStore.setState(initial, true);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  Object.defineProperty(window, 'innerHeight', { value: 1200, configurable: true });
});

describe('TimelinePaneSplitter', () => {
  it('resizes from the timeline top edge', () => {
    const splitter = renderSplitter();
    fireEvent.pointerDown(splitter, { pointerId: 1, clientY: 700 });
    fireEvent.pointerMove(splitter, { pointerId: 1, clientY: 700 });
    expect(useEditorStore.getState().timelinePaneHeight).toBe(300);
  });

  it('limits the timeline to three quarters of the window', () => {
    const splitter = renderSplitter();
    fireEvent.pointerDown(splitter, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(splitter, { pointerId: 1, clientY: 0 });
    expect(useEditorStore.getState().timelinePaneHeight).toBe(900);
  });

  it('supports keyboard resizing and reset to forty percent', () => {
    const splitter = renderSplitter();
    fireEvent.keyDown(splitter, { key: 'ArrowUp' });
    expect(useEditorStore.getState().timelinePaneHeight).toBe(416);
    fireEvent.keyDown(splitter, { key: 'ArrowDown', shiftKey: true });
    expect(useEditorStore.getState().timelinePaneHeight).toBe(352);
    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(useEditorStore.getState().timelinePaneHeight).toBeNull();
  });
});
