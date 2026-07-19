'use client';

import { cn } from '@videodip/ui';
import { useEditorStore } from '../editor.store';

/** Keyboard resize step in pixels; Shift applies four steps. */
const KEY_STEP = 16;

/** Accessible horizontal divider controlling the lower timeline height. */
export function TimelinePaneSplitter() {
  const timelinePaneHeight = useEditorStore((state) => state.timelinePaneHeight);
  const setTimelinePaneHeight = useEditorStore((state) => state.setTimelinePaneHeight);

  const measuredHeight = (element: HTMLElement): number =>
    element.parentElement?.getBoundingClientRect().height ?? 0;

  const resizeTo = (element: HTMLElement, clientY: number) => {
    const parent = element.parentElement;
    if (!parent) return;
    const requested = parent.getBoundingClientRect().bottom - clientY;
    setTimelinePaneHeight(Math.min(requested, Math.round(window.innerHeight * 0.75)));
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize timeline"
      aria-valuenow={timelinePaneHeight ?? undefined}
      aria-valuetext={timelinePaneHeight === null ? '40 percent' : `${timelinePaneHeight} pixels`}
      tabIndex={0}
      title="Drag to resize the timeline. Double-click to reset to 40%."
      className={cn(
        'absolute -top-1 right-0 left-0 z-20 h-2 cursor-row-resize',
        'transition-colors duration-(--duration-fast)',
        'hover:bg-accent/40 active:bg-accent/60',
        'focus-visible:bg-accent/40 focus-visible:outline-none',
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          resizeTo(event.currentTarget, event.clientY);
        }
      }}
      onDoubleClick={() => setTimelinePaneHeight(null)}
      onKeyDown={(event) => {
        if (event.key === 'Home') {
          event.preventDefault();
          setTimelinePaneHeight(null);
          return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const step = (event.shiftKey ? 4 : 1) * KEY_STEP;
        const current = timelinePaneHeight ?? measuredHeight(event.currentTarget);
        setTimelinePaneHeight(current + (event.key === 'ArrowUp' ? step : -step));
      }}
    />
  );
}
