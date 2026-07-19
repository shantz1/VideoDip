import type { ClipId, SegmentId, TrackId, TransitionId } from '@videodip/shared';
import type { TimelineRuntimeIndex } from '../runtime-index/runtime-index.types.js';
import type {
  ClipTransformPreview,
  CreateEditingSessionInput,
  EditingSession,
  EditingSessionViewport,
  SelectionSet,
  SessionReconcileGuards,
  TimelineSelectionRef,
  TimelineTool,
  TrackViewState,
} from './session.types.js';
import type { ClipTransform } from '../document/document.types.js';

/** Viewport zoom bounds, in pixels per second. */
export const SESSION_ZOOM_MIN = 5;
export const SESSION_ZOOM_MAX = 400;
export const SESSION_ZOOM_DEFAULT = 50;
/**
 * Multiplicative zoom step. Zoom is perceptually logarithmic: a fixed
 * additive step feels enormous zoomed out and useless zoomed in.
 */
export const SESSION_ZOOM_STEP = 1.3;
/** Default expanded track row height in CSS pixels. */
export const SESSION_TRACK_HEIGHT_DEFAULT = 44;
/** Smallest user-resizable expanded track row height. */
export const SESSION_TRACK_HEIGHT_MIN = 32;
/** Largest user-resizable track row height. */
export const SESSION_TRACK_HEIGHT_MAX = 160;
/** Compact height used while a track is collapsed. */
export const SESSION_TRACK_HEIGHT_COLLAPSED = 28;

function clampZoom(zoom: number): number {
  return Math.min(SESSION_ZOOM_MAX, Math.max(SESSION_ZOOM_MIN, zoom));
}

const DEFAULT_VIEWPORT: EditingSessionViewport = {
  zoom: SESSION_ZOOM_DEFAULT,
  isSnappingEnabled: true,
};

const EMPTY_SELECTION: SelectionSet = { refs: [], primary: null, anchor: null };

function refsEqual(a: TimelineSelectionRef | null, b: TimelineSelectionRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.id === b.id;
}

function selectionOf(ref: TimelineSelectionRef | null): SelectionSet {
  return ref === null ? EMPTY_SELECTION : { refs: [ref], primary: ref, anchor: ref };
}

/** Creates a session with defaults: nothing selected, default zoom, snapping on, select tool. */
export function createEditingSession(input?: CreateEditingSessionInput): EditingSession {
  const viewportOverride = input?.viewport;
  const zoom =
    viewportOverride?.zoom !== undefined && Number.isFinite(viewportOverride.zoom)
      ? clampZoom(viewportOverride.zoom)
      : DEFAULT_VIEWPORT.zoom;
  const isSnappingEnabled =
    viewportOverride?.isSnappingEnabled ?? DEFAULT_VIEWPORT.isSnappingEnabled;

  return {
    selection: selectionOf(input?.selection ?? null),
    viewport: { zoom, isSnappingEnabled },
    activeTool: input?.activeTool ?? 'select',
    clipTransformPreview: null,
    trackViews: {},
  };
}

/** Returns one track's ephemeral view state, supplying stable defaults when absent. */
export function getSessionTrackView(session: EditingSession, trackId: TrackId): TrackViewState {
  return (
    session.trackViews[trackId] ?? {
      isCollapsed: false,
      rowHeight: SESSION_TRACK_HEIGHT_DEFAULT,
    }
  );
}

/** Collapses or expands one track row without changing the project document. */
export function toggleSessionTrackCollapsed(
  session: EditingSession,
  trackId: TrackId,
): EditingSession {
  const current = getSessionTrackView(session, trackId);
  return {
    ...session,
    trackViews: {
      ...session.trackViews,
      [trackId]: { ...current, isCollapsed: !current.isCollapsed },
    },
  };
}

/** Resizes one expanded track row, clamped to the supported UI range. */
export function setSessionTrackRowHeight(
  session: EditingSession,
  trackId: TrackId,
  rowHeight: number,
): EditingSession {
  if (!Number.isFinite(rowHeight)) return session;
  const current = getSessionTrackView(session, trackId);
  const clamped = Math.min(
    SESSION_TRACK_HEIGHT_MAX,
    Math.max(SESSION_TRACK_HEIGHT_MIN, Math.round(rowHeight)),
  );
  if (current.rowHeight === clamped) return session;
  return {
    ...session,
    trackViews: { ...session.trackViews, [trackId]: { ...current, rowHeight: clamped } },
  };
}

/**
 * Replaces the selection with a single item. Passing null clears it.
 * Selecting the currently selected primary (same type and id, and no other
 * member) returns the same session reference.
 */
export function selectSessionItem(
  session: EditingSession,
  ref: TimelineSelectionRef | null,
): EditingSession {
  const current = session.selection;
  if (current.refs.length <= 1 && refsEqual(current.primary, ref)) return session;
  const keepsPreview = ref?.type === 'clip' && session.clipTransformPreview?.clipId === ref.id;
  return {
    ...session,
    selection: selectionOf(ref),
    clipTransformPreview: keepsPreview ? session.clipTransformPreview : null,
  };
}

/** Clears the selection; returns the same reference when nothing was selected. */
export function clearSessionSelection(session: EditingSession): EditingSession {
  return selectSessionItem(session, null);
}

/**
 * Adds `ref` to the selection if absent, or removes it if present
 * (ctrl/cmd+click semantics). The new `primary` is `ref` when adding, or the
 * new last member of `refs` (`null` if now empty) when removing. `anchor`
 * follows `primary` on add; on remove it only moves if the removed ref was
 * the anchor.
 */
export function toggleSessionSelection(
  session: EditingSession,
  ref: TimelineSelectionRef,
): EditingSession {
  const current = session.selection;
  const index = current.refs.findIndex((existing) => refsEqual(existing, ref));

  if (index === -1) {
    const refs = [...current.refs, ref];
    return { ...session, selection: { refs, primary: ref, anchor: ref } };
  }

  const refs = current.refs.filter((_, i) => i !== index);
  const primary = refs.at(-1) ?? null;
  const anchor = refsEqual(current.anchor, ref) ? primary : current.anchor;
  const keepsPreview =
    primary?.type === 'clip' && session.clipTransformPreview?.clipId === primary.id;
  return {
    ...session,
    selection: { refs, primary, anchor },
    clipTransformPreview: keepsPreview ? session.clipTransformPreview : null,
  };
}

/**
 * Range-selects from the current anchor through `ref`, using `orderedRefs`
 * to determine what lies between them (shift+click semantics). Falls back to
 * a plain replace-select (`ref` becomes the new anchor) when there is no
 * anchor yet, or when `orderedRefs` does not contain both the anchor and
 * `ref` — e.g. the anchor was a different item kind. `anchor` itself never
 * moves as a result of a successful range-extend, so repeated shift+clicks
 * all extend from the same pivot.
 */
export function extendSessionSelection(
  session: EditingSession,
  ref: TimelineSelectionRef,
  orderedRefs: readonly TimelineSelectionRef[],
): EditingSession {
  const anchor = session.selection.anchor;
  if (anchor === null) return selectSessionItem(session, ref);

  const anchorIndex = orderedRefs.findIndex((candidate) => refsEqual(candidate, anchor));
  const refIndex = orderedRefs.findIndex((candidate) => refsEqual(candidate, ref));
  if (anchorIndex === -1 || refIndex === -1) return selectSessionItem(session, ref);

  const [start, end] = anchorIndex <= refIndex ? [anchorIndex, refIndex] : [refIndex, anchorIndex];
  const refs = orderedRefs.slice(start, end + 1);
  const keepsPreview = session.clipTransformPreview !== null;
  return {
    ...session,
    selection: { refs, primary: ref, anchor },
    clipTransformPreview: keepsPreview ? session.clipTransformPreview : null,
  };
}

/** Whether `ref` is a member of the current selection. */
export function isSessionRefSelected(session: EditingSession, ref: TimelineSelectionRef): boolean {
  return session.selection.refs.some((existing) => refsEqual(existing, ref));
}

/** All clip ids currently in the selection, in `refs` order. */
export function getSessionSelectedClipIds(session: EditingSession): readonly ClipId[] {
  return session.selection.refs
    .filter((ref): ref is Extract<TimelineSelectionRef, { type: 'clip' }> => ref.type === 'clip')
    .map((ref) => ref.id);
}

/** All subtitle segment ids currently in the selection, in `refs` order. */
export function getSessionSelectedSubtitleSegmentIds(
  session: EditingSession,
): readonly SegmentId[] {
  return session.selection.refs
    .filter(
      (ref): ref is Extract<TimelineSelectionRef, { type: 'subtitle-segment' }> =>
        ref.type === 'subtitle-segment',
    )
    .map((ref) => ref.id);
}

/**
 * Sets absolute zoom, clamped to [SESSION_ZOOM_MIN, SESSION_ZOOM_MAX].
 * Non-finite input (NaN, +/-Infinity) is ignored and returns the same
 * reference: a garbage zoom is a caller bug, but the session must never
 * become unrenderable because of it.
 */
export function setSessionZoom(session: EditingSession, zoom: number): EditingSession {
  if (!Number.isFinite(zoom)) return session;
  const clamped = clampZoom(zoom);
  if (clamped === session.viewport.zoom) return session;
  return { ...session, viewport: { ...session.viewport, zoom: clamped } };
}

/** Steps zoom multiplicatively by SESSION_ZOOM_STEP, clamped; 'in' magnifies. */
export function stepSessionZoom(session: EditingSession, direction: 'in' | 'out'): EditingSession {
  const factor = direction === 'in' ? SESSION_ZOOM_STEP : 1 / SESSION_ZOOM_STEP;
  return setSessionZoom(session, session.viewport.zoom * factor);
}

/** Toggles snap correction for move/trim gestures. */
export function toggleSessionSnapping(session: EditingSession): EditingSession {
  return {
    ...session,
    viewport: { ...session.viewport, isSnappingEnabled: !session.viewport.isSnappingEnabled },
  };
}

/** Switches the active tool; returns the same reference when unchanged. */
export function setSessionTool(session: EditingSession, tool: TimelineTool): EditingSession {
  if (session.activeTool === tool) return session;
  return { ...session, activeTool: tool };
}

function transformsEqual(a: ClipTransform, b: ClipTransform): boolean {
  return (
    a.positionX === b.positionX &&
    a.positionY === b.positionY &&
    a.scaleX === b.scaleX &&
    a.scaleY === b.scaleY &&
    a.rotation === b.rotation
  );
}

/** Publishes a renderer-only transform for the currently selected clip. */
export function previewSessionClipTransform(
  session: EditingSession,
  clipId: ClipId,
  transform: ClipTransform,
): EditingSession {
  const primary = session.selection.primary;
  if (primary?.type !== 'clip' || primary.id !== clipId) return session;
  const current = session.clipTransformPreview;
  if (current?.clipId === clipId && transformsEqual(current.transform, transform)) return session;
  return { ...session, clipTransformPreview: { clipId, transform } };
}

/** Discards a direct-manipulation preview without editing the document. */
export function clearSessionClipTransformPreview(session: EditingSession): EditingSession {
  return session.clipTransformPreview === null
    ? session
    : { ...session, clipTransformPreview: null };
}

/** Returns the transient transform for `clipId`, or null when none is active. */
export function getSessionClipTransformPreview(
  session: EditingSession,
  clipId: ClipId,
): ClipTransformPreview | null {
  return session.clipTransformPreview?.clipId === clipId ? session.clipTransformPreview : null;
}

function isRefAlive(
  ref: TimelineSelectionRef,
  index: TimelineRuntimeIndex,
  guards?: SessionReconcileGuards,
): boolean {
  switch (ref.type) {
    case 'clip':
      return index.clipsById.has(ref.id);
    case 'transition':
      return index.transitionsById.has(ref.id);
    case 'subtitle-segment':
      return guards?.hasSubtitleSegment ? guards.hasSubtitleSegment(ref.id) : true;
  }
}

/**
 * Drops every selected ref whose referent no longer exists.
 *
 * Clip and transition referents resolve through the runtime index in O(1).
 * The index must have been built from the document the session is being
 * reconciled against. Subtitle referents resolve through
 * `guards.hasSubtitleSegment` when provided and are preserved otherwise. If
 * `primary` or `anchor` was dropped, it falls back to the nearest surviving
 * member of `refs` (`primary`'s old position, then the new last member), or
 * `null` if the set is now empty. Returns the same reference when nothing
 * changed. Call after every committed transaction, undo, redo, load, and
 * reset.
 */
export function reconcileSession(
  session: EditingSession,
  index: TimelineRuntimeIndex,
  guards?: SessionReconcileGuards,
): EditingSession {
  const selection = session.selection;
  let next = session;

  const refs = selection.refs.filter((ref) => isRefAlive(ref, index, guards));
  if (refs.length !== selection.refs.length) {
    const primary = selection.primary;
    const alivePrimary =
      primary && refs.some((ref) => refsEqual(ref, primary)) ? primary : (refs.at(-1) ?? null);
    const anchor = selection.anchor;
    const aliveAnchor =
      anchor && refs.some((ref) => refsEqual(ref, anchor)) ? anchor : alivePrimary;
    next = { ...next, selection: { refs, primary: alivePrimary, anchor: aliveAnchor } };
  }

  if (
    next.clipTransformPreview !== null &&
    !index.clipsById.has(next.clipTransformPreview.clipId)
  ) {
    next = { ...next, clipTransformPreview: null };
  }
  const trackViewEntries = Object.entries(next.trackViews).filter(([trackId]) =>
    index.tracksById.has(trackId as TrackId),
  );
  if (trackViewEntries.length !== Object.keys(next.trackViews).length) {
    next = {
      ...next,
      trackViews: Object.fromEntries(trackViewEntries) as Readonly<Record<TrackId, TrackViewState>>,
    };
  }
  return next;
}

/** The primary selected clip's id, or null when the primary is not a clip. */
export function getSelectedClipId(session: EditingSession): ClipId | null {
  const primary = session.selection.primary;
  return primary?.type === 'clip' ? primary.id : null;
}

/** The primary selected transition's id, or null when the primary is not a transition. */
export function getSelectedTransitionId(session: EditingSession): TransitionId | null {
  const primary = session.selection.primary;
  return primary?.type === 'transition' ? primary.id : null;
}

/** The primary selected subtitle segment's id, or null when the primary is not one. */
export function getSelectedSubtitleSegmentId(session: EditingSession): SegmentId | null {
  const primary = session.selection.primary;
  return primary?.type === 'subtitle-segment' ? primary.id : null;
}
