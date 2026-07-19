'use client';

import { resolveSubtitleStyle } from '@videodip/subtitle-engine';
import { getSelectedSubtitleSegmentId } from '@videodip/timeline';
import { cn } from '@videodip/ui';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../editor.store';
import { COMPOSITION_SIZE } from '../lib/composition-size';
import { moveSubtitlePosition } from '../lib/subtitle-preview-position';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';

interface DragState {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly positionX: import('@videodip/shared').Normalized;
  readonly positionY: import('@videodip/shared').Normalized;
}

/** Interactive stage layer for subtitle selection, dragging, and snap guides. */
export function SubtitlePreviewOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const document = useSubtitleStore((state) => state.document);
  const stylePreviews = useSubtitleStore((state) => state.stylePreviews);
  const previewStyle = useSubtitleStore((state) => state.previewStyle);
  const commitStylePreview = useSubtitleStore((state) => state.commitStylePreview);
  const cancelStylePreview = useSubtitleStore((state) => state.cancelStylePreview);
  const selectedId = useSessionStore((state) => getSelectedSubtitleSegmentId(state.session));
  const selectSubtitle = useSubtitleStore((state) => state.select);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const playhead = useEditorStore((state) => state.playhead);
  const isSnapEnabled = useSessionStore((state) => state.session.viewport.isSnappingEnabled);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const [guides, setGuides] = useState<{ vertical: number | null; horizontal: number | null }>({
    vertical: null,
    horizontal: null,
  });

  const selectedCue = document.segments.find((segment) => segment.id === selectedId);
  const activeCue = document.segments.find(
    (segment) => playhead >= segment.start && playhead < segment.end,
  );
  const cue = selectedCue ?? activeCue;
  const style = useMemo(
    () =>
      cue ? resolveSubtitleStyle(document.defaultStyle, cue.style, stylePreviews[cue.id]) : null,
    [cue, document.defaultStyle, stylePreviews],
  );

  if (!cue || !style) return null;
  const isSelected = cue.id === selectedId;
  const compositionWidth = COMPOSITION_SIZE[aspectRatio].width;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    selectSubtitle(cue.id);
    setInspectorTab('subtitle');
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      positionX: style.positionX,
      positionY: style.positionY,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !root) return;
    const bounds = root.getBoundingClientRect();
    const moved = moveSubtitlePosition(
      drag,
      event.clientX - drag.clientX,
      event.clientY - drag.clientY,
      bounds.width,
      bounds.height,
      isSnapEnabled,
    );
    previewStyle(cue.id, { positionX: moved.positionX, positionY: moved.positionY });
    setGuides({ vertical: moved.verticalGuide, horizontal: moved.horizontalGuide });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setGuides({ vertical: null, horizontal: null });
    commitStylePreview(cue.id);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setGuides({ vertical: null, horizontal: null });
    cancelStylePreview(cue.id);
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden={!isSelected}
    >
      {guides.vertical !== null && (
        <div
          className="bg-accent pointer-events-none absolute top-0 bottom-0 w-px"
          style={{ left: `${guides.vertical * 100}%` }}
        />
      )}
      {guides.horizontal !== null && (
        <div
          className="bg-accent pointer-events-none absolute right-0 left-0 h-px"
          style={{ top: `${guides.horizontal * 100}%` }}
        />
      )}
      <div
        role="button"
        aria-label={`Move subtitle: ${cue.text}`}
        tabIndex={isSelected ? 0 : -1}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        className={cn(
          'pointer-events-auto absolute cursor-move border border-transparent text-transparent select-none',
          'hover:border-accent/70 focus-visible:border-accent focus-visible:outline-none',
          isSelected && 'border-accent',
        )}
        style={{
          left: `${style.positionX * 100}%`,
          top: `${style.positionY * 100}%`,
          width: `${style.maxWidth * 100}%`,
          transform: `translate(-50%, -50%) rotate(${style.rotation}deg) scale(${style.scale})`,
          transformOrigin: 'center',
          fontFamily: style.fontFamily,
          fontSize: `calc(${style.fontSize} * 100cqw / ${compositionWidth})`,
          fontWeight: style.fontWeight,
          fontStyle: style.isItalic ? 'italic' : 'normal',
          letterSpacing: `calc(${style.letterSpacing} * 100cqw / ${compositionWidth})`,
          lineHeight: style.lineHeight,
          textAlign: style.alignment,
          padding: `calc(${style.padding} * 100cqw / ${compositionWidth})`,
        }}
      >
        {cue.text}
        {isSelected && (
          <>
            <span className="border-accent bg-surface-base absolute -top-1 -left-1 size-2 rounded-full border" />
            <span className="border-accent bg-surface-base absolute -top-1 -right-1 size-2 rounded-full border" />
            <span className="border-accent bg-surface-base absolute -bottom-1 -left-1 size-2 rounded-full border" />
            <span className="border-accent bg-surface-base absolute -right-1 -bottom-1 size-2 rounded-full border" />
          </>
        )}
      </div>
    </div>
  );
}
