'use client';

import { ms, type Milliseconds, type Result, type SegmentId, type TrackId } from '@videodip/shared';
import type { SubtitleSegment } from '@videodip/subtitle-engine';
import {
  getDuration,
  getSessionTrackView,
  getSelectedClipId,
  getSelectedSubtitleSegmentId,
  getSelectedTransitionId,
  SESSION_TRACK_HEIGHT_COLLAPSED,
  SESSION_TRACK_HEIGHT_DEFAULT,
  SESSION_TRACK_HEIGHT_MAX,
  SESSION_TRACK_HEIGHT_MIN,
  type Clip,
  type ClipTransition,
  type Track,
  type TimelineSelectionRef,
  type TimelineDocument,
  type TrimEdge,
  type UpdateTrackStateInput,
} from '@videodip/timeline';
import { Button, cn } from '@videodip/ui';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Maximize2,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useEditorStore } from '../editor.store';
import {
  calculateAnchoredScrollLeft,
  calculateFitZoom,
  getContentDuration,
  MIN_VIEW_DURATION,
  trackColorClass,
} from '../lib/timeline-presentation';
import { formatTimecode } from '../lib/timecode';
import { snapTimelineTime } from '../lib/timeline-snap';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';

const HEADER_WIDTH = 176;

interface TimelineContextMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}

interface TimelineContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly TimelineContextMenuItem[];
}

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
  const zoom = useSessionStore((s) => s.session.viewport.zoom);
  const snapEnabled = useSessionStore((s) => s.session.viewport.isSnappingEnabled);
  const zoomIn = useSessionStore((s) => s.zoomIn);
  const zoomOut = useSessionStore((s) => s.zoomOut);
  const setZoom = useSessionStore((s) => s.setZoom);
  const toggleSnap = useSessionStore((s) => s.toggleSnapping);
  const selectedClipId = useSessionStore((s) => getSelectedClipId(s.session));
  // Subscribe to the stable selection reference, then derive arrays locally.
  // Returning `filter().map()` directly from a Zustand selector manufactures
  // a fresh external-store snapshot on every read and React rejects it as an
  // infinite update source in the browser.
  const selectionRefs = useSessionStore((s) => s.session.selection.refs);
  const selectedClipIds = useMemo(
    () => selectionRefs.filter((ref) => ref.type === 'clip').map((ref) => ref.id),
    [selectionRefs],
  );
  const selectedSubtitleIds = useMemo(
    () => selectionRefs.filter((ref) => ref.type === 'subtitle-segment').map((ref) => ref.id),
    [selectionRefs],
  );
  const selectedTransitionId = useSessionStore((s) => getSelectedTransitionId(s.session));
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const playhead = useEditorStore((s) => s.playhead);
  const document = useProjectStore((s) => s.document);
  const removeClip = useProjectStore((s) => s.removeClip);
  const removeClips = useProjectStore((s) => s.removeClips);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const splitClip = useProjectStore((s) => s.splitClip);
  const selectedSubtitleId = useSessionStore((s) => getSelectedSubtitleSegmentId(s.session));
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const removeSubtitle = useSubtitleStore((state) => state.remove);
  const removeSubtitles = useSubtitleStore((state) => state.removeMany);
  const splitSubtitle = useSubtitleStore((state) => state.split);

  const fitTimeline = () => {
    if (viewportWidth <= 0) return;
    const contentDuration = getContentDuration(
      getDuration(document),
      subtitleDocument.segments.at(-1)?.end,
    );
    setZoom(calculateFitZoom(viewportWidth, contentDuration));
  };

  const selectedClip = selectedClipId
    ? document.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId)
    : undefined;
  const hasLockedSelection = document.tracks.some((track) => {
    if (!track.isLocked) return false;
    if (
      track.clips.some((clip) => selectedClipIds.includes(clip.id)) ||
      document.transitions.some(
        (transition) => transition.id === selectedTransitionId && transition.trackId === track.id,
      )
    ) {
      return true;
    }
    return track.kind === 'subtitle' && selectedSubtitleIds.length > 0;
  });

  // The playhead must sit strictly inside the clip — splitting at an edge
  // would produce one empty half, which `splitClip` itself rejects.
  const canSplit =
    selectedClip !== undefined &&
    !hasLockedSelection &&
    playhead > selectedClip.start &&
    playhead < selectedClip.start + selectedClip.duration;
  const selectedSubtitle = selectedSubtitleId
    ? subtitleDocument.segments.find((segment) => segment.id === selectedSubtitleId)
    : undefined;
  const canSplitSubtitle =
    selectedSubtitle !== undefined &&
    !hasLockedSelection &&
    playhead > selectedSubtitle.start &&
    playhead < selectedSubtitle.end;

  const handleDelete = () => {
    if (hasLockedSelection) return;
    if (selectedClipIds.length > 1) {
      removeClips(selectedClipIds);
      clearSelection();
    } else if (selectedClipId) {
      removeClip(selectedClipId);
      clearSelection();
    } else if (selectedTransitionId) {
      removeTransition(selectedTransitionId);
      clearSelection();
    } else if (selectedSubtitleIds.length > 1) {
      removeSubtitles(selectedSubtitleIds);
      clearSelection();
    } else if (selectedSubtitleId) {
      removeSubtitle(selectedSubtitleId);
      clearSelection();
    }
  };

  const handleSplit = () => {
    if (selectedClipId && canSplit) {
      if (splitClip(selectedClipId, playhead).ok) clearSelection();
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
        aria-label={
          selectedClipIds.length > 1
            ? `Delete ${selectedClipIds.length} selected clips`
            : selectedSubtitleIds.length > 1
              ? `Delete ${selectedSubtitleIds.length} selected subtitles`
              : 'Delete selected timeline item'
        }
        disabled={
          hasLockedSelection || (!selectedClipId && !selectedTransitionId && !selectedSubtitleId)
        }
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
  const updateTrackState = useProjectStore((state) => state.updateTrackState);
  const session = useSessionStore((state) => state.session);
  const toggleTrackCollapsed = useSessionStore((state) => state.toggleTrackCollapsed);
  const setTrackRowHeight = useSessionStore((state) => state.setTrackRowHeight);

  return (
    <div className="border-border-subtle shrink-0 border-r" style={{ width: HEADER_WIDTH }}>
      {/* Spacer aligning headers with the ruler. */}
      <div className="border-border-subtle h-6 border-b" />
      {tracks.map((track) => {
        const view = getSessionTrackView(session, track.id);
        return (
          <TrackHeaderRow
            key={track.id}
            track={track}
            isCollapsed={view.isCollapsed}
            rowHeight={view.rowHeight}
            onToggleCollapsed={() => toggleTrackCollapsed(track.id)}
            onResize={(height) => setTrackRowHeight(track.id, height)}
            onUpdate={(patch) => updateTrackState(track.id, patch)}
          />
        );
      })}
    </div>
  );
}

function TrackHeaderRow({
  track,
  isCollapsed,
  rowHeight,
  onToggleCollapsed,
  onResize,
  onUpdate,
}: {
  readonly track: Track;
  readonly isCollapsed: boolean;
  readonly rowHeight: number;
  readonly onToggleCollapsed: () => void;
  readonly onResize: (height: number) => void;
  readonly onUpdate: (patch: UpdateTrackStateInput) => Result<TimelineDocument>;
}) {
  const resizeStart = useRef<{ readonly y: number; readonly height: number } | null>(null);
  const height = isCollapsed ? SESSION_TRACK_HEIGHT_COLLAPSED : rowHeight;
  const iconButton =
    'text-text-tertiary hover:bg-surface-hover hover:text-text-primary flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-(--color-border-focus)';

  return (
    <div
      className="border-border-subtle relative flex items-center gap-1 border-b px-1"
      style={{ height }}
      data-track-header={track.id}
    >
      <button
        type="button"
        className={iconButton}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${track.label} track`}
        aria-expanded={!isCollapsed}
        onClick={onToggleCollapsed}
      >
        {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      <span
        className={cn('h-4 w-0.5 shrink-0 rounded-full', trackColorClass(track.kind))}
        aria-hidden="true"
      />
      <span className="text-text-secondary min-w-0 flex-1 truncate text-xs">{track.label}</span>
      <button
        type="button"
        className={cn(iconButton, !track.isVisible && 'bg-surface-selected text-accent')}
        aria-label={`${track.isVisible ? 'Hide' : 'Show'} ${track.label} track`}
        aria-pressed={!track.isVisible}
        onClick={() => onUpdate({ isVisible: !track.isVisible })}
      >
        {track.isVisible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
      </button>
      <button
        type="button"
        className={cn(iconButton, track.isMuted && 'bg-surface-selected text-accent')}
        aria-label={`${track.isMuted ? 'Unmute' : 'Mute'} ${track.label} track`}
        aria-pressed={track.isMuted}
        onClick={() => onUpdate({ isMuted: !track.isMuted })}
      >
        {track.isMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
      </button>
      <button
        type="button"
        className={cn(iconButton, track.isLocked && 'bg-surface-selected text-accent')}
        aria-label={`${track.isLocked ? 'Unlock' : 'Lock'} ${track.label} track`}
        aria-pressed={track.isLocked}
        onClick={() => onUpdate({ isLocked: !track.isLocked })}
      >
        {track.isLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
      </button>
      {!isCollapsed && (
        <div
          role="separator"
          aria-label={`Resize ${track.label} track`}
          aria-orientation="horizontal"
          aria-valuemin={SESSION_TRACK_HEIGHT_MIN}
          aria-valuemax={SESSION_TRACK_HEIGHT_MAX}
          aria-valuenow={rowHeight}
          tabIndex={0}
          className="bg-border-subtle hover:bg-accent focus-visible:bg-accent absolute inset-x-0 bottom-0 h-px cursor-row-resize touch-none focus-visible:outline-none"
          onPointerDown={(event) => {
            resizeStart.current = { y: event.clientY, height: rowHeight };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current;
            if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            onResize(start.height + event.clientY - start.y);
          }}
          onPointerUp={(event) => {
            resizeStart.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            resizeStart.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            onResize(rowHeight + (event.key === 'ArrowUp' ? -4 : 4));
          }}
        />
      )}
    </div>
  );
}

function TimelineTracks({ viewportRef }: { viewportRef: React.RefObject<HTMLDivElement | null> }) {
  const zoom = useSessionStore((s) => s.session.viewport.zoom);
  const trackViews = useSessionStore((s) => s.session.trackViews);
  const zoomIn = useSessionStore((s) => s.zoomIn);
  const zoomOut = useSessionStore((s) => s.zoomOut);
  const playhead = useEditorStore((s) => s.playhead);
  const seek = useEditorStore((s) => s.seek);
  const nudge = useEditorStore((s) => s.nudge);
  const selectedClipId = useSessionStore((s) => getSelectedClipId(s.session));
  const selectionRefs = useSessionStore((s) => s.session.selection.refs);
  const selectedTransitionId = useSessionStore((s) => getSelectedTransitionId(s.session));
  const select = useSessionStore((s) => s.select);
  const toggleSelect = useSessionStore((s) => s.toggleSelect);
  const extendSelect = useSessionStore((s) => s.extendSelect);
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const selectedClipIdSet = useMemo(
    () =>
      new Set(selectionRefs.filter((ref) => ref.type === 'clip').map((ref) => ref.id as string)),
    [selectionRefs],
  );
  const selectedSubtitleIdSet = useMemo(
    () =>
      new Set(
        selectionRefs
          .filter((ref) => ref.type === 'subtitle-segment')
          .map((ref) => ref.id as string),
      ),
    [selectionRefs],
  );
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const projectDocument = useProjectStore((s) => s.document);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const removeClips = useProjectStore((s) => s.removeClips);
  const addTransition = useProjectStore((s) => s.addTransition);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const selectedSubtitleId = useSessionStore((s) => getSelectedSubtitleSegmentId(s.session));
  const splitSubtitle = useSubtitleStore((state) => state.split);
  const updateSubtitle = useSubtitleStore((state) => state.update);
  const removeSubtitle = useSubtitleStore((state) => state.remove);
  const removeSubtitles = useSubtitleStore((state) => state.removeMany);
  const setInspectorTab = useEditorStore((state) => state.setInspectorTab);
  const snapEnabled = useSessionStore((s) => s.session.viewport.isSnappingEnabled);
  const [editError, setEditError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TimelineContextMenuState | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();

      const pointerX = event.clientX - viewport.getBoundingClientRect().left;
      const previousZoom = useSessionStore.getState().session.viewport.zoom;
      if (event.deltaY < 0) zoomIn();
      else zoomOut();
      const nextZoom = useSessionStore.getState().session.viewport.zoom;
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
      if (result.ok) clearSelection();
    } else if (selectedSubtitleId && canSplitSubtitleAtPlayhead) {
      const result = splitSubtitle(selectedSubtitleId, playhead);
      setEditError(result.ok ? null : result.error.recovery);
    }
  };

  // The ruler must cover both the placeholder minimum and whatever real
  // clips exist — a clip placed past the placeholder's 60s must stay visible
  // and seekable rather than getting clipped by the ruler's own width.
  const contentDuration = getContentDuration(
    getDuration(projectDocument),
    subtitleDocument.segments.at(-1)?.end,
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

  const subtitleSnapTargetsFor = (excludedId: SegmentId): readonly Milliseconds[] => [
    ms(0),
    playhead,
    ...subtitleDocument.segments
      .filter((segment) => segment.id !== excludedId)
      .flatMap((segment) => [segment.start, segment.end]),
  ];

  const selectedClipIds = useMemo(
    () => selectionRefs.filter((ref) => ref.type === 'clip').map((ref) => ref.id),
    [selectionRefs],
  );
  const selectedSubtitleIds = useMemo(
    () => selectionRefs.filter((ref) => ref.type === 'subtitle-segment').map((ref) => ref.id),
    [selectionRefs],
  );

  const openClipContextMenu = (event: MouseEvent<HTMLButtonElement>, clip: Clip) => {
    event.preventDefault();
    const bulk = selectedClipIdSet.has(clip.id) && selectedClipIds.length > 1;
    const targetIds = bulk ? selectedClipIds : [clip.id];
    if (!bulk) select({ type: 'clip', id: clip.id });
    const canSplitHere =
      targetIds.length === 1 && playhead > clip.start && playhead < clip.start + clip.duration;
    const hasLockedTarget = projectDocument.tracks.some(
      (track) =>
        track.isLocked && track.clips.some((candidate) => targetIds.includes(candidate.id)),
    );

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Split at playhead',
          disabled: !canSplitHere || hasLockedTarget,
          onSelect: () => {
            const result = splitClip(clip.id, playhead);
            setEditError(result.ok ? null : result.error.recovery);
            if (result.ok) clearSelection();
          },
        },
        {
          label: targetIds.length > 1 ? `Delete ${targetIds.length} clips` : 'Delete',
          disabled: hasLockedTarget,
          danger: true,
          onSelect: () => {
            if (targetIds.length > 1) removeClips(targetIds);
            else removeClip(clip.id);
            clearSelection();
          },
        },
      ],
    });
  };

  const openSubtitleContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    segment: SubtitleSegment,
  ) => {
    event.preventDefault();
    const bulk = selectedSubtitleIdSet.has(segment.id) && selectedSubtitleIds.length > 1;
    const targetIds = bulk ? selectedSubtitleIds : [segment.id];
    if (!bulk) select({ type: 'subtitle-segment', id: segment.id });
    const canSplitHere =
      targetIds.length === 1 && playhead > segment.start && playhead < segment.end;
    const isSubtitleTrackLocked =
      projectDocument.tracks.find((track) => track.kind === 'subtitle')?.isLocked ?? false;

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Split at playhead',
          disabled: !canSplitHere || isSubtitleTrackLocked,
          onSelect: () => {
            const result = splitSubtitle(segment.id, playhead);
            setEditError(result.ok ? null : result.error.recovery);
          },
        },
        {
          label: targetIds.length > 1 ? `Delete ${targetIds.length} subtitles` : 'Delete',
          disabled: isSubtitleTrackLocked,
          danger: true,
          onSelect: () => {
            if (targetIds.length > 1) removeSubtitles(targetIds);
            else removeSubtitle(segment.id);
            clearSelection();
          },
        },
      ],
    });
  };

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
          const trackView = trackViews[track.id] ?? {
            isCollapsed: false,
            rowHeight: SESSION_TRACK_HEIGHT_DEFAULT,
          };
          const trackHeight = trackView.isCollapsed
            ? SESSION_TRACK_HEIGHT_COLLAPSED
            : trackView.rowHeight;
          return (
            <div
              key={track.id}
              className="group/track border-border-subtle relative overflow-hidden border-b"
              style={{
                height: trackHeight,
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
                  selected={selectedClipIdSet.has(clip.id)}
                  isLocked={track.isLocked}
                  onSelect={(event) => {
                    const ref: TimelineSelectionRef = { type: 'clip', id: clip.id };
                    if (event.shiftKey) {
                      extendSelect(
                        ref,
                        orderedClips.map(
                          (candidate): TimelineSelectionRef => ({
                            type: 'clip',
                            id: candidate.id,
                          }),
                        ),
                      );
                    } else if (
                      (event.metaKey || event.ctrlKey) &&
                      selectionRefs.every((selectedRef) => selectedRef.type === 'clip')
                    ) {
                      toggleSelect(ref);
                    } else {
                      select(ref);
                    }
                  }}
                  onMove={(newStart) => {
                    const result = moveClip(clip.id, newStart);
                    setEditError(result.ok ? null : result.error.recovery);
                  }}
                  onTrim={(edge, newTime) => {
                    const result = trimClip(clip.id, edge, newTime);
                    setEditError(result.ok ? null : result.error.recovery);
                  }}
                  onContextMenu={(event) => openClipContextMenu(event, clip)}
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
                    isLocked={track.isLocked}
                    onActivate={() => {
                      if (transition) {
                        select({ type: 'transition', id: transition.id });
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
                        select({ type: 'transition', id: added.id });
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
                    snapEnabled={snapEnabled}
                    snapTargets={subtitleSnapTargetsFor(segment.id)}
                    selected={selectedSubtitleIdSet.has(segment.id)}
                    isLocked={track.isLocked}
                    onMove={(newStart) => {
                      const duration = segment.end - segment.start;
                      const result = updateSubtitle(segment.id, {
                        start: newStart,
                        end: ms(newStart + duration),
                      });
                      setEditError(result.ok ? null : result.error.recovery);
                    }}
                    onTrim={(edge, newTime) => {
                      const result = updateSubtitle(
                        segment.id,
                        edge === 'start' ? { start: newTime } : { end: newTime },
                      );
                      setEditError(result.ok ? null : result.error.recovery);
                    }}
                    onSelect={(event) => {
                      const ref: TimelineSelectionRef = {
                        type: 'subtitle-segment',
                        id: segment.id,
                      };
                      if (event.shiftKey) {
                        extendSelect(
                          ref,
                          subtitleDocument.segments.map(
                            (candidate): TimelineSelectionRef => ({
                              type: 'subtitle-segment',
                              id: candidate.id,
                            }),
                          ),
                        );
                      } else if (
                        (event.metaKey || event.ctrlKey) &&
                        selectionRefs.every(
                          (selectedRef) => selectedRef.type === 'subtitle-segment',
                        )
                      ) {
                        toggleSelect(ref);
                      } else {
                        select(ref);
                      }
                      setInspectorTab('subtitle');
                    }}
                    onContextMenu={(event) => openSubtitleContextMenu(event, segment)}
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
      {contextMenu && <TimelineContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

function TimelineContextMenu({
  x,
  y,
  items,
  onClose,
}: TimelineContextMenuState & { readonly onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  // Keep the menu on-screen at extreme edges rather than letting it overflow.
  const left = Math.min(x, (typeof window === 'undefined' ? Infinity : window.innerWidth) - 176);
  const top = Math.min(
    y,
    (typeof window === 'undefined' ? Infinity : window.innerHeight) - items.length * 32 - 16,
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Timeline item actions"
      className="border-border-default bg-surface-overlay fixed z-(--z-dropdown) min-w-40 rounded-md border p-1 shadow-lg"
      style={{ left: Math.max(0, left), top: Math.max(0, top) }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={cn(
            'flex w-full rounded-sm px-2 py-1.5 text-left text-xs',
            item.danger
              ? 'text-danger hover:bg-danger-subtle'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
            'disabled:text-text-disabled disabled:pointer-events-none',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TimelineTransitionControl({
  from,
  to,
  transition,
  zoom,
  selected,
  isLocked,
  onActivate,
}: {
  readonly from: Clip;
  readonly to: Clip;
  readonly transition: ClipTransition | undefined;
  readonly zoom: number;
  readonly selected: boolean;
  readonly isLocked: boolean;
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
      disabled={isLocked}
      onClick={onActivate}
      className={cn(
        'absolute top-1/2 z-20 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        transition
          ? 'border-accent bg-accent-subtle text-accent'
          : 'border-border-default bg-surface-overlay text-text-secondary opacity-0 group-hover/track:opacity-100 focus-visible:opacity-100',
        selected && 'ring-offset-surface-base ring-2 ring-(--color-border-focus) ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
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

/**
 * Shared pointer-drag mechanics for anything laid out on the timeline as a
 * `[start, start + duration)` span: move by dragging the body, trim either
 * edge by dragging a `data-trim-edge` handle. `TimelineClip` and
 * `TimelineSubtitleCue` both use this — the gesture logic (snap, minimum
 * length, live preview) is identical for either; only what commits the
 * final position differs per item kind.
 */
function useTimelineSpanGesture({
  start,
  duration,
  zoom,
  snapEnabled,
  snapTargets,
  onMove,
  onTrim,
  isLocked,
}: {
  readonly start: Milliseconds;
  readonly duration: Milliseconds;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly snapTargets: readonly Milliseconds[];
  readonly onMove: (newStart: Milliseconds) => void;
  readonly onTrim: (edge: TrimEdge, newTime: Milliseconds) => void;
  readonly isLocked: boolean;
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
    const spanEnd = start + duration;

    if (mode === 'start') {
      let nextStart = ms(Math.max(0, Math.min(spanEnd - 10, start + delta)));
      if (snapEnabled) nextStart = snapTimelineTime(nextStart, snapTargets, threshold);
      nextStart = ms(Math.max(0, Math.min(spanEnd - 10, nextStart)));
      return { start: nextStart, duration: ms(spanEnd - nextStart) };
    }

    if (mode === 'end') {
      let nextEnd = ms(Math.max(start + 10, spanEnd + delta));
      if (snapEnabled) nextEnd = snapTimelineTime(nextEnd, snapTargets, threshold);
      nextEnd = ms(Math.max(start + 10, nextEnd));
      return { start, duration: ms(nextEnd - start) };
    }

    let nextStart = ms(Math.max(0, start + delta));
    if (snapEnabled) {
      const snappedStart = snapTimelineTime(nextStart, snapTargets, threshold);
      const proposedEnd = ms(nextStart + duration);
      const snappedEnd = snapTimelineTime(proposedEnd, snapTargets, threshold);
      nextStart =
        Math.abs(snappedStart - nextStart) <= Math.abs(snappedEnd - proposedEnd)
          ? snappedStart
          : ms(snappedEnd - duration);
      nextStart = ms(Math.max(0, nextStart));
    }
    return { start: nextStart, duration };
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (isLocked) return;
    if (event.button !== 0) return;
    const edge = (event.target as HTMLElement).dataset.trimEdge;
    const mode = edge === 'start' || edge === 'end' ? edge : 'move';
    gesture.current = { mode, startX: event.clientX, hasMoved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Selection itself happens on click (below), not here: a click fires
    // for both mouse and keyboard (Enter/Space) activation and carries the
    // modifier keys toggle/range-select need, so it is the single source of
    // truth for `onSelect` — calling it here too would double-fire it.
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

  const visible = preview ?? { start, duration };
  return {
    visibleStart: visible.start,
    visibleDuration: visible.duration,
    handlePointerDown,
    handlePointerMove,
    finishPointer,
    cancelPointer,
  };
}

function TimelineSubtitleCue({
  text,
  start,
  end,
  zoom,
  snapEnabled,
  snapTargets,
  selected,
  isLocked,
  onSelect,
  onMove,
  onTrim,
  onContextMenu,
}: {
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly snapTargets: readonly Milliseconds[];
  readonly selected: boolean;
  readonly isLocked: boolean;
  readonly onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onMove: (newStart: Milliseconds) => void;
  readonly onTrim: (edge: TrimEdge, newTime: Milliseconds) => void;
  readonly onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const {
    visibleStart,
    visibleDuration,
    handlePointerDown,
    handlePointerMove,
    finishPointer,
    cancelPointer,
  } = useTimelineSpanGesture({
    start,
    duration: ms(end - start),
    zoom,
    snapEnabled,
    snapTargets,
    onMove,
    onTrim,
    isLocked,
  });

  return (
    <button
      type="button"
      title={text}
      aria-label={`${text}, ${((end - start) / 1000).toFixed(2)} seconds`}
      aria-pressed={selected}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={cancelPointer}
      className={cn(
        'group bg-track-subtitle text-2xs text-text-on-brand absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-sm px-1.5 text-left active:cursor-grabbing',
        'transition-shadow duration-(--duration-fast)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        selected
          ? 'ring-offset-surface-base ring-2 ring-(--color-border-focus) ring-offset-1'
          : 'hover:brightness-110',
        isLocked && 'cursor-default active:cursor-default',
      )}
      style={{
        left: (visibleStart / 1000) * zoom,
        width: Math.max((visibleDuration / 1000) * zoom, 4),
      }}
    >
      {!isLocked && (
        <span
          data-trim-edge="start"
          className="bg-surface-overlay/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
      <span className="truncate">{text}</span>
      {!isLocked && (
        <span
          data-trim-edge="end"
          className="bg-surface-overlay/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
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
  isLocked,
  onSelect,
  onMove,
  onTrim,
  onContextMenu,
}: {
  label: string;
  color: string;
  clip: Clip;
  zoom: number;
  snapEnabled: boolean;
  snapTargets: readonly Milliseconds[];
  selected: boolean;
  isLocked: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onMove: (newStart: Milliseconds) => void;
  onTrim: (edge: TrimEdge, newTime: Milliseconds) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const {
    visibleStart,
    visibleDuration,
    handlePointerDown,
    handlePointerMove,
    finishPointer,
    cancelPointer,
  } = useTimelineSpanGesture({
    start: clip.start,
    duration: clip.duration,
    zoom,
    snapEnabled,
    snapTargets,
    onMove,
    onTrim,
    isLocked,
  });

  const left = (visibleStart / 1000) * zoom;
  const width = (visibleDuration / 1000) * zoom;

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
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
        isLocked && 'cursor-default active:cursor-default',
      )}
      // Guard against a sliver too thin to click at extreme zoom-out.
      style={{ left, width: Math.max(width, 4) }}
    >
      {!isLocked && (
        <span
          data-trim-edge="start"
          className="bg-surface-overlay/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
      <span className="truncate">{label}</span>
      {!isLocked && (
        <span
          data-trim-edge="end"
          className="bg-surface-overlay/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
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
