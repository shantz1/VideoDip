'use client';

import { ms, type Milliseconds } from '@videodip/shared';
import { getDuration, type Clip, type ClipTransition, type TrimEdge } from '@videodip/timeline';
import { Button, cn } from '@videodip/ui';
import { Magnet, Maximize2, Plus, Scissors, Sparkles, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useEditorStore } from '../editor.store';
import {
  calculateAnchoredScrollLeft,
  calculateFitZoom,
  MIN_VIEW_DURATION,
  trackColorClass,
} from '../lib/timeline-presentation';
import { formatTimecode } from '../lib/timecode';
import { snapTimelineTime } from '../lib/timeline-snap';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';

const TRACK_HEIGHT = 44;
const HEADER_WIDTH = 112;

/**
 * The timeline.
 *
 * Renders real clips from `project.store.ts`'s document — ruler, tracks,
 * playhead and clips themselves. Clips can be selected, moved, edge-trimmed,
 * split and deleted; all document mutations stay in the timeline domain.
 */
export function TimelinePanel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="border-border-subtle bg-surface-base flex h-full shrink-0 flex-col border-t"
      aria-label="Timeline"
    >
      <TimelineToolbar viewportWidth={viewportWidth} />
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <TrackHeaders />
        <TimelineTracks viewportRef={viewportRef} />
      </div>
    </section>
  );
}

function TimelineToolbar({ viewportWidth }: { viewportWidth: number }) {
  const zoom = useEditorStore((s) => s.zoom);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const setZoom = useEditorStore((s) => s.setZoom);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const playhead = useEditorStore((s) => s.playhead);
  const document = useProjectStore((s) => s.document);
  const removeClip = useProjectStore((s) => s.removeClip);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const splitClip = useProjectStore((s) => s.splitClip);
  const selectedSubtitleId = useEditorStore((state) => state.selectedSubtitleId);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const selectSubtitle = useSubtitleStore((state) => state.select);
  const removeSubtitle = useSubtitleStore((state) => state.remove);
  const splitSubtitle = useSubtitleStore((state) => state.split);

  const fitTimeline = () => {
    if (viewportWidth <= 0) return;
    setZoom(calculateFitZoom(viewportWidth, getDuration(document)));
  };

  const selectedClip = selectedClipId
    ? document.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : undefined;

  // The playhead must sit strictly inside the clip — splitting at an edge
  // would produce one empty half, which `splitClip` itself rejects.
  const canSplit =
    selectedClip !== undefined &&
    playhead > selectedClip.start &&
    playhead < selectedClip.start + selectedClip.duration;
  const selectedSubtitle = selectedSubtitleId
    ? subtitleDocument.segments.find((segment) => segment.id === selectedSubtitleId)
    : undefined;
  const canSplitSubtitle =
    selectedSubtitle !== undefined &&
    playhead > selectedSubtitle.start &&
    playhead < selectedSubtitle.end;

  const handleDelete = () => {
    if (selectedClipId) {
      removeClip(selectedClipId);
      selectClip(null);
    } else if (selectedTransitionId) {
      removeTransition(selectedTransitionId);
      selectTransition(null);
    } else if (selectedSubtitleId) {
      removeSubtitle(selectedSubtitleId);
      selectSubtitle(null);
    }
  };

  const handleSplit = () => {
    if (selectedClipId && canSplit) {
      if (splitClip(selectedClipId, playhead).ok) selectClip(null);
    } else if (selectedSubtitleId && canSplitSubtitle) {
      void splitSubtitle(selectedSubtitleId, playhead);
    }
  };

  return (
    <div className="border-border-subtle flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Split clip at playhead"
        disabled={!canSplit && !canSplitSubtitle}
        onClick={handleSplit}
        leadingIcon={<Scissors />}
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete selected timeline item"
        disabled={!selectedClipId && !selectedTransitionId && !selectedSubtitleId}
        onClick={handleDelete}
        leadingIcon={<Trash2 />}
      />

      <div className="bg-border-subtle mx-1 h-4 w-px" />

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
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Fit timeline to view"
          title="Fit timeline to view"
          disabled={viewportWidth <= 0}
          onClick={fitTimeline}
          leadingIcon={<Maximize2 />}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out"
          title="Zoom out (Ctrl/Cmd + scroll down)"
          onClick={zoomOut}
          leadingIcon={<ZoomOut />}
        />
        <span className="text-2xs text-text-tertiary w-14 text-center font-mono tabular-nums">
          {Math.round(zoom)} px/s
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in"
          title="Zoom in (Ctrl/Cmd + scroll up)"
          onClick={zoomIn}
          leadingIcon={<ZoomIn />}
        />
      </div>
    </div>
  );
}

function TrackHeaders() {
  const tracks = useProjectStore((state) => state.document.tracks);

  return (
    <div className="border-border-subtle shrink-0 border-r" style={{ width: HEADER_WIDTH }}>
      {/* Spacer aligning headers with the ruler. */}
      <div className="border-border-subtle h-6 border-b" />
      {tracks.map((track) => (
        <div
          key={track.id}
          className="border-border-subtle flex items-center gap-2 border-b px-2"
          style={{ height: TRACK_HEIGHT }}
        >
          <span
            className={cn('h-4 w-0.5 rounded-full', trackColorClass(track.kind))}
            aria-hidden="true"
          />
          <span className="text-text-secondary truncate text-xs">{track.label}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineTracks({ viewportRef }: { viewportRef: React.RefObject<HTMLDivElement | null> }) {
  const zoom = useEditorStore((s) => s.zoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const playhead = useEditorStore((s) => s.playhead);
  const seek = useEditorStore((s) => s.seek);
  const nudge = useEditorStore((s) => s.nudge);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const projectDocument = useProjectStore((s) => s.document);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const addTransition = useProjectStore((s) => s.addTransition);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const selectedSubtitleId = useEditorStore((state) => state.selectedSubtitleId);
  const selectSubtitle = useSubtitleStore((state) => state.select);
  const splitSubtitle = useSubtitleStore((state) => state.split);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const [editError, setEditError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();

      const pointerX = event.clientX - viewport.getBoundingClientRect().left;
      const previousZoom = useEditorStore.getState().zoom;
      if (event.deltaY < 0) zoomIn();
      else zoomOut();
      const nextZoom = useEditorStore.getState().zoom;
      viewport.scrollLeft = calculateAnchoredScrollLeft(
        viewport.scrollLeft,
        pointerX,
        previousZoom,
        nextZoom,
      );
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [viewportRef, zoomIn, zoomOut]);

  const selectedClip = selectedClipId
    ? projectDocument.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId)
    : undefined;
  const canSplitAtPlayhead =
    selectedClip !== undefined &&
    playhead > selectedClip.start &&
    playhead < selectedClip.start + selectedClip.duration;
  const selectedSubtitle = selectedSubtitleId
    ? subtitleDocument.segments.find((segment) => segment.id === selectedSubtitleId)
    : undefined;
  const canSplitSubtitleAtPlayhead =
    selectedSubtitle !== undefined &&
    playhead > selectedSubtitle.start &&
    playhead < selectedSubtitle.end;

  const splitAtPlayhead = () => {
    if (selectedClipId && canSplitAtPlayhead) {
      const result = splitClip(selectedClipId, playhead);
      setEditError(result.ok ? null : result.error.recovery);
      if (result.ok) selectClip(null);
    } else if (selectedSubtitleId && canSplitSubtitleAtPlayhead) {
      const result = splitSubtitle(selectedSubtitleId, playhead);
      setEditError(result.ok ? null : result.error.recovery);
    }
  };

  // The ruler must cover both the placeholder minimum and whatever real
  // clips exist — a clip placed past the placeholder's 60s must stay visible
  // and seekable rather than getting clipped by the ruler's own width.
  const contentDuration = Math.max(
    getDuration(projectDocument),
    subtitleDocument.segments.at(-1)?.end ?? 0,
  );
  const viewDuration = Math.max(MIN_VIEW_DURATION, contentDuration);
  const width = (viewDuration / 1000) * zoom;

  /** Converts a click x-offset into a time and seeks there. */
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
    seek(ms((x / zoom) * 1000));
  };

  /**
   * Converts a viewport x-coordinate into a time and seeks there — the drag
   * form of `seekFromPointer`, anchored to the scrolled content so a captured
   * pointer keeps scrubbing correctly wherever it wanders.
   */
  const scrubToClientX = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    seek(ms(Math.max(0, ((clientX - rect.left) / zoom) * 1000)));
  };

  const mediaNameFor = (assetId: string): string =>
    mediaItems.find((item) => item.id === assetId)?.name ?? 'Unknown clip';

  const snapTargetsFor = (excluded: Clip): readonly Milliseconds[] => [
    ms(0),
    playhead,
    ...projectDocument.tracks.flatMap((track) =>
      track.clips
        .filter((clip) => clip.id !== excluded.id)
        .flatMap((clip) => [clip.start, ms(clip.start + clip.duration)]),
    ),
  ];

  return (
    <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-x-auto">
      {editError && (
        <p
          role="alert"
          className="bg-danger-subtle text-danger sticky left-2 z-(--z-dropdown) float-left mt-1 rounded-md px-2 py-1 text-xs"
        >
          {editError}
        </p>
      )}
      <div ref={contentRef} style={{ width, minWidth: '100%' }} className="relative">
        <Ruler
          zoom={zoom}
          duration={viewDuration}
          playhead={playhead}
          onSeek={seekFromPointer}
          onNudge={(deltaMs) => nudge(ms(deltaMs))}
        />

        {projectDocument.tracks.map((track) => {
          const color = trackColorClass(track.kind);
          const orderedClips = [...track.clips].sort((left, right) => left.start - right.start);
          return (
            <div
              key={track.id}
              className="group/track border-border-subtle relative border-b"
              style={{
                height: TRACK_HEIGHT,
                // Vertical grid every second, drawn in CSS rather than as
                // elements: at 60s and 400px/s that would be thousands of DOM
                // nodes, and the timeline must hold 60fps while scrubbing.
                backgroundImage: `repeating-linear-gradient(to right, var(--color-timeline-grid) 0 1px, transparent 1px ${zoom}px)`,
              }}
            >
              {orderedClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  label={mediaNameFor(clip.assetId)}
                  color={color}
                  clip={clip}
                  zoom={zoom}
                  snapEnabled={snapEnabled}
                  snapTargets={snapTargetsFor(clip)}
                  selected={clip.id === selectedClipId}
                  onSelect={() => selectClip(clip.id)}
                  onMove={(newStart) => {
                    const result = moveClip(clip.id, newStart);
                    setEditError(result.ok ? null : result.error.recovery);
                  }}
                  onTrim={(edge, newTime) => {
                    const result = trimClip(clip.id, edge, newTime);
                    setEditError(result.ok ? null : result.error.recovery);
                  }}
                />
              ))}
              {orderedClips.slice(0, -1).map((from, index) => {
                const to = orderedClips[index + 1];
                if (!to || from.start + from.duration !== to.start) return null;
                const fromMedia = mediaItems.find((item) => item.id === from.assetId);
                const toMedia = mediaItems.find((item) => item.id === to.assetId);
                if (fromMedia?.kind !== 'video' || toMedia?.kind !== 'video') return null;
                const transition = projectDocument.transitions.find(
                  (candidate) => candidate.fromClipId === from.id && candidate.toClipId === to.id,
                );
                return (
                  <TimelineTransitionControl
                    key={`${from.id}:${to.id}`}
                    from={from}
                    to={to}
                    transition={transition}
                    zoom={zoom}
                    selected={transition?.id === selectedTransitionId}
                    onActivate={() => {
                      if (transition) {
                        selectTransition(transition.id);
                        selectSubtitle(null);
                        setInspectorTab('effects');
                        return;
                      }
                      const result = addTransition({
                        fromClipId: from.id,
                        toClipId: to.id,
                        kind: 'crossfade',
                        duration: ms(Math.min(500, from.duration, to.duration)),
                      });
                      setEditError(result.ok ? null : result.error.recovery);
                      const added = result.ok
                        ? result.value.transitions.find(
                            (candidate) =>
                              candidate.fromClipId === from.id && candidate.toClipId === to.id,
                          )
                        : undefined;
                      if (added) {
                        selectTransition(added.id);
                        selectSubtitle(null);
                        setInspectorTab('effects');
                      }
                    }}
                  />
                );
              })}
              {track.kind === 'subtitle' &&
                subtitleDocument.segments.map((segment) => (
                  <TimelineSubtitleCue
                    key={segment.id}
                    text={segment.text}
                    start={segment.start}
                    end={segment.end}
                    zoom={zoom}
                    selected={segment.id === selectedSubtitleId}
                    onSelect={() => {
                      selectClip(null);
                      selectSubtitle(segment.id);
                      setInspectorTab('subtitle');
                    }}
                  />
                ))}
            </div>
          );
        })}

        <Playhead
          x={(playhead / 1000) * zoom}
          canSplit={canSplitAtPlayhead || canSplitSubtitleAtPlayhead}
          onSplit={splitAtPlayhead}
          onScrub={scrubToClientX}
        />
      </div>
    </div>
  );
}

function TimelineTransitionControl({
  from,
  to,
  transition,
  zoom,
  selected,
  onActivate,
}: {
  readonly from: Clip;
  readonly to: Clip;
  readonly transition: ClipTransition | undefined;
  readonly zoom: number;
  readonly selected: boolean;
  readonly onActivate: () => void;
}) {
  const duration = transition?.duration ?? ms(250);
  const width = Math.max(18, (duration / 1000) * zoom);
  const Icon = transition ? Sparkles : Plus;
  return (
    <button
      type="button"
      aria-label={
        transition ? `Edit ${transition.kind} transition` : 'Add transition between adjacent clips'
      }
      title={transition ? `Edit ${transition.kind} transition` : 'Add transition'}
      onClick={onActivate}
      className={cn(
        'absolute top-1/2 z-20 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        transition
          ? 'border-accent bg-accent-subtle text-accent'
          : 'border-border-default bg-surface-overlay text-text-secondary opacity-0 group-hover/track:opacity-100 focus-visible:opacity-100',
        selected && 'ring-offset-surface-base ring-2 ring-(--color-border-focus) ring-offset-1',
      )}
      style={{ left: ((from.start + from.duration) / 1000) * zoom, width }}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">
        {from.id} to {to.id}
      </span>
    </button>
  );
}

function TimelineSubtitleCue({
  text,
  start,
  end,
  zoom,
  selected,
  onSelect,
}: {
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly zoom: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={text}
      aria-label={`${text}, ${((end - start) / 1000).toFixed(2)} seconds`}
      onClick={onSelect}
      className={cn(
        'bg-track-subtitle text-2xs text-text-on-brand absolute top-1 bottom-1 overflow-hidden rounded-sm px-1.5 text-left',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        selected
          ? 'ring-offset-surface-base ring-2 ring-(--color-border-focus) ring-offset-1'
          : 'hover:brightness-110',
      )}
      style={{ left: (start / 1000) * zoom, width: Math.max(((end - start) / 1000) * zoom, 4) }}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}

function TimelineClip({
  label,
  color,
  clip,
  zoom,
  snapEnabled,
  snapTargets,
  selected,
  onSelect,
  onMove,
  onTrim,
}: {
  label: string;
  color: string;
  clip: Clip;
  zoom: number;
  snapEnabled: boolean;
  snapTargets: readonly Milliseconds[];
  selected: boolean;
  onSelect: () => void;
  onMove: (newStart: Milliseconds) => void;
  onTrim: (edge: TrimEdge, newTime: Milliseconds) => void;
}) {
  const gesture = useRef<{ mode: 'move' | TrimEdge; startX: number; hasMoved: boolean } | null>(
    null,
  );
  const [preview, setPreview] = useState<{ start: Milliseconds; duration: Milliseconds } | null>(
    null,
  );

  const positionFor = (deltaPixels: number) => {
    const delta = Math.round((deltaPixels / zoom) * 1000);
    const threshold = ms(Math.round((8 / zoom) * 1000));
    const mode = gesture.current?.mode ?? 'move';
    const clipEnd = clip.start + clip.duration;

    if (mode === 'start') {
      let start = ms(Math.max(0, Math.min(clipEnd - 10, clip.start + delta)));
      if (snapEnabled) start = snapTimelineTime(start, snapTargets, threshold);
      start = ms(Math.max(0, Math.min(clipEnd - 10, start)));
      return { start, duration: ms(clipEnd - start) };
    }

    if (mode === 'end') {
      let end = ms(Math.max(clip.start + 10, clipEnd + delta));
      if (snapEnabled) end = snapTimelineTime(end, snapTargets, threshold);
      end = ms(Math.max(clip.start + 10, end));
      return { start: clip.start, duration: ms(end - clip.start) };
    }

    let start = ms(Math.max(0, clip.start + delta));
    if (snapEnabled) {
      const snappedStart = snapTimelineTime(start, snapTargets, threshold);
      const proposedEnd = ms(start + clip.duration);
      const snappedEnd = snapTimelineTime(proposedEnd, snapTargets, threshold);
      start =
        Math.abs(snappedStart - start) <= Math.abs(snappedEnd - proposedEnd)
          ? snappedStart
          : ms(snappedEnd - clip.duration);
      start = ms(Math.max(0, start));
    }
    return { start, duration: clip.duration };
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const edge = (event.target as HTMLElement).dataset.trimEdge;
    const mode = edge === 'start' || edge === 'end' ? edge : 'move';
    gesture.current = { mode, startX: event.clientX, hasMoved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current) return;
    const delta = event.clientX - current.startX;
    if (Math.abs(delta) > 2) current.hasMoved = true;
    if (current.hasMoved) setPreview(positionFor(delta));
  };

  const finishPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current) return;
    const position = positionFor(event.clientX - current.startX);
    if (current.hasMoved) {
      if (current.mode === 'move') onMove(position.start);
      else if (current.mode === 'start') onTrim('start', position.start);
      else onTrim('end', ms(position.start + position.duration));
    }
    gesture.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelPointer = () => {
    gesture.current = null;
    setPreview(null);
  };

  const visible = preview ?? clip;
  const left = (visible.start / 1000) * zoom;
  const width = (visible.duration / 1000) * zoom;

  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={cancelPointer}
      title={label}
      aria-label={`${label}, ${(clip.duration / 1000).toFixed(2)} seconds`}
      className={cn(
        'group text-2xs text-text-on-brand absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-sm px-1.5 text-left active:cursor-grabbing',
        'transition-shadow duration-(--duration-fast)',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-(--color-border-focus)',
        color,
        selected
          ? 'ring-offset-surface-base ring-2 ring-(--color-border-focus) ring-offset-1'
          : 'hover:brightness-110',
      )}
      // Guard against a sliver too thin to click at extreme zoom-out.
      style={{ left, width: Math.max(width, 4) }}
    >
      <span
        data-trim-edge="start"
        className="bg-surface-overlay/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      <span
        data-trim-edge="end"
        className="bg-surface-overlay/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}

function Ruler({
  zoom,
  duration,
  playhead,
  onSeek,
  onNudge,
}: {
  zoom: number;
  duration: number;
  playhead: number;
  onSeek: (event: React.PointerEvent<HTMLDivElement>) => void;
  onNudge: (deltaMs: number) => void;
}) {
  // Choose a tick interval that keeps labels ~60px apart, so the ruler stays
  // legible across the whole zoom range instead of collapsing into a smear.
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = candidates.find((s) => s * zoom >= 60) ?? 600;
  const ticks = Math.floor(duration / 1000 / step) + 1;

  return (
    <div
      className="border-border-subtle bg-surface-raised relative h-6 cursor-pointer border-b"
      // Capture on press so dragging keeps scrubbing — a ruler that only
      // seeks on the initial click reads as broken the moment the pointer
      // moves.
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onSeek(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onSeek(event);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const magnitude = event.shiftKey ? 1000 : 100;
        onNudge(event.key === 'ArrowLeft' ? -magnitude : magnitude);
      }}
      role="slider"
      aria-label="Playhead position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(playhead)}
      tabIndex={0}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const seconds = i * step;
        return (
          <div
            key={seconds}
            className="border-border-subtle absolute top-0 h-full border-l pl-1"
            style={{ left: seconds * zoom }}
          >
            <span className="text-2xs text-text-tertiary font-mono leading-6 tabular-nums">
              {formatTimecode(ms(seconds * 1000)).replace(/\.\d+$/, '')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Playhead({
  x,
  canSplit,
  onSplit,
  onScrub,
}: {
  x: number;
  canSplit: boolean;
  onSplit: () => void;
  onScrub: (clientX: number) => void;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-0 bottom-0 w-px',
        'bg-timeline-playhead z-(--z-timeline-playhead)',
      )}
      style={{ left: x }}
    >
      <div
        className="bg-timeline-playhead absolute -top-0 -left-[3px] size-[7px] rounded-[2px]"
        aria-hidden="true"
      />
      {/* Mouse-only drag handle over the full line. Keyboard users get the
          equivalent control on the ruler slider above, so this stays out of
          the accessibility tree rather than duplicating it. */}
      <div
        aria-hidden="true"
        className="pointer-events-auto absolute inset-y-0 -left-1 w-2 cursor-ew-resize"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onScrub(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) onScrub(event.clientX);
        }}
      />
      <Button
        size="icon-sm"
        variant="danger"
        aria-label="Split selected clip at playhead"
        title={canSplit ? 'Split selected clip at playhead' : 'Select a clip under the playhead'}
        disabled={!canSplit}
        onClick={onSplit}
        className="pointer-events-auto absolute top-7 -left-3 shadow-sm"
        leadingIcon={<Scissors />}
      />
    </div>
  );
}
