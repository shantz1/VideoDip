import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { WorkspacePaneSplitter } from './workspace-pane-splitter';

const initial = useEditorStore.getState();

function renderSplitter(pane: 'library' | 'inspector') {
  const view = render(
    <div>
      <WorkspacePaneSplitter pane={pane} />
    </div>,
  );
  const wrapper = view.container.firstElementChild;
  if (!(wrapper instanceof HTMLElement)) throw new Error('Expected pane wrapper.');
  wrapper.getBoundingClientRect = () => ({ left: 100, right: 500, width: 400 }) as DOMRect;
  return screen.getByRole('separator');
}

beforeEach(() => {
  useEditorStore.setState(initial, true);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
});

describe('WorkspacePaneSplitter', () => {
  it('resizes the library from its right edge', () => {
    const splitter = renderSplitter('library');
    fireEvent.pointerDown(splitter, { clientX: 450, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 450, pointerId: 1 });
    expect(useEditorStore.getState().libraryPaneWidth).toBe(350);
  });

  it('resizes the inspector from its left edge', () => {
    const splitter = renderSplitter('inspector');
    fireEvent.pointerDown(splitter, { clientX: 180, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 180, pointerId: 1 });
    expect(useEditorStore.getState().inspectorPaneWidth).toBe(320);
  });

  it('supports directional keyboard resizing and reset', () => {
    const library = renderSplitter('library');
    fireEvent.keyDown(library, { key: 'ArrowRight' });
    expect(useEditorStore.getState().libraryPaneWidth).toBe(416);
    fireEvent.keyDown(library, { key: 'Home' });
    expect(useEditorStore.getState().libraryPaneWidth).toBeNull();
  });
});
