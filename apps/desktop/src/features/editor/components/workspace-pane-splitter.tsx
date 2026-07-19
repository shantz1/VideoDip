'use client';

import { cn } from '@videodip/ui';
import { useEditorStore } from '../editor.store';
import { DEFAULT_INSPECTOR_PANE_WIDTH, DEFAULT_LIBRARY_PANE_WIDTH } from '../lib/workspace-layout';

/** Keyboard resize step in pixels; Shift applies a larger adjustment. */
const KEY_STEP = 16;

export interface WorkspacePaneSplitterProps {
  /** The side pane whose adjacent edge owns this splitter. */
  readonly pane: 'library' | 'inspector';
}

/** Accessible drag and keyboard resize handle for an editor side pane. */
export function WorkspacePaneSplitter({ pane }: WorkspacePaneSplitterProps) {
  const libraryPaneWidth = useEditorStore((state) => state.libraryPaneWidth);
  const inspectorPaneWidth = useEditorStore((state) => state.inspectorPaneWidth);
  const setLibraryPaneWidth = useEditorStore((state) => state.setLibraryPaneWidth);
  const setInspectorPaneWidth = useEditorStore((state) => state.setInspectorPaneWidth);
  const storedWidth = pane === 'library' ? libraryPaneWidth : inspectorPaneWidth;
  const defaultWidth =
    pane === 'library' ? DEFAULT_LIBRARY_PANE_WIDTH : DEFAULT_INSPECTOR_PANE_WIDTH;
  const setWidth = pane === 'library' ? setLibraryPaneWidth : setInspectorPaneWidth;
  const label = pane === 'library' ? 'Resize media library' : 'Resize inspector';

  const measuredWidth = (element: HTMLElement): number =>
    element.parentElement?.getBoundingClientRect().width ?? defaultWidth;

  const resizeTo = (element: HTMLElement, clientX: number) => {
    const parent = element.parentElement;
    if (parent === null) return;
    const bounds = parent.getBoundingClientRect();
    const requested = pane === 'library' ? clientX - bounds.left : bounds.right - clientX;
    // Side tools may grow, but never consume most of the application window.
    setWidth(Math.min(requested, Math.round(window.innerWidth * 0.45)));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={storedWidth ?? defaultWidth}
      tabIndex={0}
      title={`Drag to ${label.toLowerCase()}. Double-click to reset.`}
      className={cn(
        'group absolute inset-y-0 z-20 w-3 cursor-col-resize',
        pane === 'library' ? '-right-1.5' : '-left-1.5',
        'focus-visible:outline-none',
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          resizeTo(event.currentTarget, event.clientX);
        }
      }}
      onDoubleClick={() => setWidth(null)}
      onKeyDown={(event) => {
        if (event.key === 'Home') {
          event.preventDefault();
          setWidth(null);
          return;
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = (event.shiftKey ? 4 : 1) * KEY_STEP;
        const current = storedWidth ?? measuredWidth(event.currentTarget);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        setWidth(current + direction * step * (pane === 'library' ? 1 : -1));
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'bg-border-default absolute inset-y-0 left-1/2 w-px -translate-x-1/2',
          'transition-colors duration-(--duration-fast)',
          'group-hover:bg-accent group-active:bg-accent group-focus-visible:bg-accent',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'border-border-default bg-surface-raised absolute top-1/2 left-1/2',
          'h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border',
          'transition-colors duration-(--duration-fast)',
          'group-hover:border-accent group-active:border-accent group-focus-visible:border-accent',
        )}
      />
    </div>
  );
}
