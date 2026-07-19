'use client';

import { cn } from '@videodip/ui';
import { useEditorStore } from '../editor.store';

/** Keyboard resize step in pixels; Shift multiplies by four. */
const KEY_STEP = 16;

/**
 * The draggable divider on the short-video stage's left edge.
 *
 * Dragging resizes the stage pane (and, since the middle track flexes,
 * everything to its left) via `stagePaneWidth`; double-click restores the
 * proportional default. Must be rendered as a direct child of the stage
 * grid cell — the pane's right edge is read from `parentElement`, which
 * keeps the math correct wherever the grid sits in the window.
 *
 * Keyboard: it is a focusable `separator`; arrow keys resize, Home resets.
 */
export function StageSplitter() {
  const stagePaneWidth = useEditorStore((s) => s.stagePaneWidth);
  const setStagePaneWidth = useEditorStore((s) => s.setStagePaneWidth);

  const paneWidth = (element: HTMLElement): number =>
    element.parentElement?.getBoundingClientRect().width ?? 0;

  const resizeTo = (element: HTMLElement, clientX: number) => {
    const parent = element.parentElement;
    if (parent === null) return;
    // Never let the drag squeeze the tools past ~40% of the window.
    const maximum = Math.round(window.innerWidth * 0.6);
    setStagePaneWidth(
      Math.min(Math.round(parent.getBoundingClientRect().right - clientX), maximum),
    );
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize video stage"
      aria-valuenow={stagePaneWidth ?? undefined}
      tabIndex={0}
      title="Drag to resize the video stage. Double-click to reset."
      className={cn(
        'group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize',
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
      onDoubleClick={() => setStagePaneWidth(null)}
      onKeyDown={(event) => {
        if (event.key === 'Home') {
          event.preventDefault();
          setStagePaneWidth(null);
          return;
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = (event.shiftKey ? 4 : 1) * KEY_STEP;
        const current = stagePaneWidth ?? Math.round(paneWidth(event.currentTarget));
        // The splitter sits on the pane's left edge: left grows the pane.
        setStagePaneWidth(current + (event.key === 'ArrowLeft' ? step : -step));
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
