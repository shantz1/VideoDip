'use client';

import { Button, cn } from '@videodip/ui';
import { Magnet, Scissors, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEditorStore } from '../editor.store';
import { formatTimecode } from '../lib/timecode';
import { ms } from '@videodip/shared';

/** Track rows, colored by the `--color-track-*` tokens. */
const TRACKS = [
  { id: 'video', label: 'Video', color: 'bg-[--color-track-video]' },
  { id: 'subtitle', label: 'Subtitles', color: 'bg-[--color-track-subtitle]' },
  { id: 'audio', label: 'Audio', color: 'bg-[--color-track-audio]' },
] as const;

const TRACK_HEIGHT = 44;
const HEADER_WIDTH = 112;

/**
 * The timeline.
 *
 * PLACEHOLDER: renders the ruler, tracks and a seekable playhead against the
 * store's placeholder duration. There are no clips — clips require
 * `packages/timeline`, which owns the data model and the ripple/split/snap
 * operations. Everything here is view; none of it should grow editing logic.
 */
export function TimelinePanel() {
  return (
    <section
      className="flex h-64 shrink-0 flex-col border-t border-border-subtle bg-surface-base"
      aria-label="Timeline"
    >
      <TimelineToolbar />
      <div className="flex min-h-0 flex-1">
        <TrackHeaders />
        <TimelineTracks />
      </div>
    </section>
  );
}

function TimelineToolbar() {
  const zoom = useEditorStore((s) => s.zoom);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
      <Button size="icon-sm" variant="ghost" aria-label="Split clip" leadingIcon={<Scissors />} />
      <Button size="icon-sm" variant="ghost" aria-label="Delete clip" leadingIcon={<Trash2 />} />

      <div className="mx-1 h-4 w-px bg-border-subtle" />

      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Snap to edges"
        // aria-pressed makes the toggle state audible; color alone does not.
        aria-pressed={snapEnabled}
        onClick={toggleSnap}
        className={cn(snapEnabled && 'bg-surface-selected text-accent')}
        leadingIcon={<Magnet />}
      />

      <div className="ml-auto flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={zoomOut} leadingIcon={<ZoomOut />} />
        <span className="w-14 text-center font-mono text-2xs tabular-nums text-text-tertiary">
          {Math.round(zoom)} px/s
        </span>
        <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={zoomIn} leadingIcon={<ZoomIn />} />
      </div>
    </div>
  );
}

function TrackHeaders() {
  return (
    <div
      className="shrink-0 border-r border-border-subtle"
      style={{ width: HEADER_WIDTH }}
    >
      {/* Spacer aligning headers with the ruler. */}
      <div className="h-6 border-b border-border-subtle" />
      {TRACKS.map((track) => (
        <div
          key={track.id}
          className="flex items-center gap-2 border-b border-border-subtle px-2"
          style={{ height: TRACK_HEIGHT }}
        >
          <span className={cn('h-4 w-0.5 rounded-full', track.color)} aria-hidden="true" />
          <span className="truncate text-xs text-text-secondary">{track.label}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineTracks() {
  const zoom = useEditorStore((s) => s.zoom);
  const duration = useEditorStore((s) => s.duration);
  const playhead = useEditorStore((s) => s.playhead);
  const seek = useEditorStore((s) => s.seek);

  const width = (duration / 1000) * zoom;

  /** Converts a click x-offset into a time and seeks there. */
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
    seek(ms((x / zoom) * 1000));
  };

  return (
    <div className="relative min-w-0 flex-1 overflow-x-auto">
      <div style={{ width, minWidth: '100%' }} className="relative">
        <Ruler zoom={zoom} duration={duration} onSeek={seekFromPointer} />

        {TRACKS.map((track) => (
          <div
            key={track.id}
            className="relative border-b border-border-subtle"
            style={{
              height: TRACK_HEIGHT,
              // Vertical grid every second, drawn in CSS rather than as
              // elements: at 60s and 400px/s that would be thousands of DOM
              // nodes, and the timeline must hold 60fps while scrubbing.
              backgroundImage: `repeating-linear-gradient(to right, var(--color-timeline-grid) 0 1px, transparent 1px ${zoom}px)`,
            }}
          />
        ))}

        <Playhead x={(playhead / 1000) * zoom} />
      </div>
    </div>
  );
}

function Ruler({
  zoom,
  duration,
  onSeek,
}: {
  zoom: number;
  duration: number;
  onSeek: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  // Choose a tick interval that keeps labels ~60px apart, so the ruler stays
  // legible across the whole zoom range instead of collapsing into a smear.
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = candidates.find((s) => s * zoom >= 60) ?? 600;
  const ticks = Math.floor(duration / 1000 / step) + 1;

  return (
    <div
      className="relative h-6 cursor-pointer border-b border-border-subtle bg-surface-raised"
      onPointerDown={onSeek}
      role="slider"
      aria-label="Playhead position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={0}
      tabIndex={0}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const seconds = i * step;
        return (
          <div
            key={seconds}
            className="absolute top-0 h-full border-l border-border-subtle pl-1"
            style={{ left: seconds * zoom }}
          >
            <span className="font-mono text-2xs leading-6 text-text-tertiary tabular-nums">
              {formatTimecode(ms(seconds * 1000)).replace(/\.\d+$/, '')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Playhead({ x }: { x: number }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-0 bottom-0 w-px',
        'bg-[--color-timeline-playhead] z-[--z-timeline-playhead]',
      )}
      style={{ left: x }}
      aria-hidden="true"
    >
      <div className="absolute -top-0 -left-[3px] size-[7px] rounded-[2px] bg-[--color-timeline-playhead]" />
    </div>
  );
}
