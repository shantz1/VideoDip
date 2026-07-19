'use client';

import {
  clearSessionClipTransformPreview,
  clearSessionSelection,
  createEditingSession,
  extendSessionSelection,
  previewSessionClipTransform,
  reconcileSession,
  selectSessionItem,
  setSessionTrackRowHeight,
  setSessionTool,
  setSessionZoom,
  stepSessionZoom,
  toggleSessionSelection,
  toggleSessionSnapping,
  toggleSessionTrackCollapsed,
  type EditingSession,
  type ClipTransform,
  type SessionReconcileGuards,
  type TimelineRuntimeIndex,
  type TimelineSelectionRef,
  type TimelineTool,
} from '@videodip/timeline';
import { create } from 'zustand';

/**
 * Ephemeral timeline editing session: selection, viewport (zoom, snapping),
 * and active tool.
 *
 * Deliberately separate from `project.store.ts` (undoable document content)
 * and `editor.store.ts` (shell layout, transport, project metadata) — this
 * state is never persisted and never enters undo history. See
 * `docs/timeline-engine-v2-phase-2-editing-session.md`.
 */
export interface SessionState {
  readonly session: EditingSession;

  readonly select: (ref: TimelineSelectionRef | null) => void;
  /** Adds `ref` to the selection, or removes it if already selected (ctrl/cmd+click). */
  readonly toggleSelect: (ref: TimelineSelectionRef) => void;
  /** Range-selects from the current anchor through `ref` within `orderedRefs` (shift+click). */
  readonly extendSelect: (
    ref: TimelineSelectionRef,
    orderedRefs: readonly TimelineSelectionRef[],
  ) => void;
  readonly clearSelection: () => void;
  readonly setZoom: (zoom: number) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly toggleSnapping: () => void;
  /** Collapses or expands one track row without touching the project document. */
  readonly toggleTrackCollapsed: (trackId: import('@videodip/shared').TrackId) => void;
  /** Sets one track's ephemeral row height in CSS pixels. */
  readonly setTrackRowHeight: (
    trackId: import('@videodip/shared').TrackId,
    rowHeight: number,
  ) => void;
  readonly setTool: (tool: TimelineTool) => void;
  /** Publishes a renderer-only direct-manipulation transform. */
  readonly previewClipTransform: (
    clipId: import('@videodip/shared').ClipId,
    transform: ClipTransform,
  ) => void;
  /** Discards the active clip transform preview. */
  readonly clearClipTransformPreview: () => void;
  /** Drops selection references whose referent no longer exists in `index`. */
  readonly reconcile: (index: TimelineRuntimeIndex, guards?: SessionReconcileGuards) => void;
  /** Fresh selection/tool for a new or loaded project; viewport prefs retained. */
  readonly resetSession: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  session: createEditingSession(),

  select: (ref) =>
    set((state) => {
      const next = selectSessionItem(state.session, ref);
      return next === state.session ? state : { session: next };
    }),

  toggleSelect: (ref) =>
    set((state) => {
      const next = toggleSessionSelection(state.session, ref);
      return next === state.session ? state : { session: next };
    }),

  extendSelect: (ref, orderedRefs) =>
    set((state) => {
      const next = extendSessionSelection(state.session, ref, orderedRefs);
      return next === state.session ? state : { session: next };
    }),

  clearSelection: () =>
    set((state) => {
      const next = clearSessionSelection(state.session);
      return next === state.session ? state : { session: next };
    }),

  setZoom: (zoom) =>
    set((state) => {
      const next = setSessionZoom(state.session, zoom);
      return next === state.session ? state : { session: next };
    }),

  zoomIn: () =>
    set((state) => {
      const next = stepSessionZoom(state.session, 'in');
      return next === state.session ? state : { session: next };
    }),

  zoomOut: () =>
    set((state) => {
      const next = stepSessionZoom(state.session, 'out');
      return next === state.session ? state : { session: next };
    }),

  toggleSnapping: () => set((state) => ({ session: toggleSessionSnapping(state.session) })),

  toggleTrackCollapsed: (trackId) =>
    set((state) => ({ session: toggleSessionTrackCollapsed(state.session, trackId) })),

  setTrackRowHeight: (trackId, rowHeight) =>
    set((state) => {
      const next = setSessionTrackRowHeight(state.session, trackId, rowHeight);
      return next === state.session ? state : { session: next };
    }),

  setTool: (tool) =>
    set((state) => {
      const next = setSessionTool(state.session, tool);
      return next === state.session ? state : { session: next };
    }),

  previewClipTransform: (clipId, transform) =>
    set((state) => {
      const next = previewSessionClipTransform(state.session, clipId, transform);
      return next === state.session ? state : { session: next };
    }),

  clearClipTransformPreview: () =>
    set((state) => {
      const next = clearSessionClipTransformPreview(state.session);
      return next === state.session ? state : { session: next };
    }),

  reconcile: (index, guards) =>
    set((state) => {
      const next = reconcileSession(state.session, index, guards);
      return next === state.session ? state : { session: next };
    }),

  resetSession: () => {
    const { viewport } = get().session;
    set({ session: createEditingSession({ viewport }) });
  },
}));
