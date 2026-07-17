'use client';

import type { ClipId, Milliseconds, Result, TrackId } from '@videodip/shared';
import {
  addClip as addClipOp,
  createEmptyTimeline,
  getDuration,
  moveClip as moveClipOp,
  removeClip as removeClipOp,
  splitClip as splitClipOp,
  trimClip as trimClipOp,
  type AddClipInput,
  type TimelineDocument,
  type TrimEdge,
} from '@videodip/timeline';
import { create } from 'zustand';
import { useEditorStore } from './editor.store';

/**
 * The project document: clips, tracks, what this app is actually editing.
 *
 * Deliberately separate from `editor.store.ts`, which owns shell/layout state
 * only. `@videodip/timeline`'s operations are pure and return `Result` on
 * failure (overlap, out-of-range trims, …) — this store applies a successful
 * result and passes failures straight through so the UI can show them, rather
 * than swallowing them at the store boundary.
 */
export interface ProjectState {
  readonly document: TimelineDocument;
  readonly past: readonly TimelineDocument[];
  readonly future: readonly TimelineDocument[];
  readonly addClip: (input: AddClipInput) => Result<TimelineDocument>;
  readonly removeClip: (clipId: ClipId) => void;
  readonly moveClip: (
    clipId: ClipId,
    newStart: Milliseconds,
    newTrackId?: TrackId,
  ) => Result<TimelineDocument>;
  readonly trimClip: (
    clipId: ClipId,
    edge: TrimEdge,
    newTime: Milliseconds,
  ) => Result<TimelineDocument>;
  readonly splitClip: (clipId: ClipId, atTime: Milliseconds) => Result<TimelineDocument>;
  /** Restores the previous document snapshot, if one exists. */
  readonly undo: () => void;
  /** Reapplies the next document snapshot after an undo, if one exists. */
  readonly redo: () => void;
  /** Discards the current document and starts a fresh, empty one. */
  readonly reset: () => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  document: createEmptyTimeline(),
  past: [],
  future: [],

  addClip: (input) => {
    const result = addClipOp(get().document, input);
    if (result.ok) applyDocument(result.value);
    return result;
  },

  removeClip: (clipId) => {
    const before = get().document;
    const next = removeClipOp(before, clipId);
    if (next !== before) applyDocument(next);
  },

  moveClip: (clipId, newStart, newTrackId) => {
    const result = moveClipOp(get().document, clipId, newStart, newTrackId);
    if (result.ok) applyDocument(result.value);
    return result;
  },

  trimClip: (clipId, edge, newTime) => {
    const result = trimClipOp(get().document, clipId, edge, newTime);
    if (result.ok) applyDocument(result.value);
    return result;
  },

  splitClip: (clipId, atTime) => {
    const result = splitClipOp(get().document, clipId, atTime);
    if (result.ok) applyDocument(result.value);
    return result;
  },

  undo: () => {
    const state = get();
    const previous = state.past.at(-1);
    if (!previous) return;
    set({
      document: previous,
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
    });
    syncEditor(previous);
  },

  redo: () => {
    const state = get();
    const [next, ...remaining] = state.future;
    if (!next) return;
    set({
      document: next,
      past: [...state.past, state.document],
      future: remaining,
    });
    syncEditor(next);
  },

  reset: () => {
    const document = createEmptyTimeline();
    set({ document, past: [], future: [] });
    syncEditor(document);
  },
}));

function applyDocument(document: TimelineDocument): void {
  const state = useProjectStore.getState();
  setProjectState({
    document,
    past: [...state.past, state.document],
    future: [],
  });
  syncEditor(document);
}

function setProjectState(state: Pick<ProjectState, 'document' | 'past' | 'future'>): void {
  useProjectStore.setState(state);
}

function syncEditor(document: TimelineDocument): void {
  const editor = useEditorStore.getState();
  editor.setProjectDuration(getDuration(document));
  editor.markDirty();
}
