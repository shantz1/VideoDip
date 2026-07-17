'use client';

import type { ClipId, Milliseconds, Result, TrackId } from '@videodip/shared';
import {
  addClip as addClipOp,
  createEmptyTimeline,
  moveClip as moveClipOp,
  removeClip as removeClipOp,
  splitClip as splitClipOp,
  trimClip as trimClipOp,
  type AddClipInput,
  type TimelineDocument,
  type TrimEdge,
} from '@videodip/timeline';
import { create } from 'zustand';

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
  readonly addClip: (input: AddClipInput) => Result<TimelineDocument>;
  readonly removeClip: (clipId: ClipId) => void;
  readonly moveClip: (
    clipId: ClipId,
    newStart: Milliseconds,
    newTrackId?: TrackId,
  ) => Result<TimelineDocument>;
  readonly trimClip: (clipId: ClipId, edge: TrimEdge, newTime: Milliseconds) => Result<TimelineDocument>;
  readonly splitClip: (clipId: ClipId, atTime: Milliseconds) => Result<TimelineDocument>;
  /** Discards the current document and starts a fresh, empty one. */
  readonly reset: () => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  document: createEmptyTimeline(),

  addClip: (input) => {
    const result = addClipOp(get().document, input);
    if (result.ok) set({ document: result.value });
    return result;
  },

  removeClip: (clipId) => set((state) => ({ document: removeClipOp(state.document, clipId) })),

  moveClip: (clipId, newStart, newTrackId) => {
    const result = moveClipOp(get().document, clipId, newStart, newTrackId);
    if (result.ok) set({ document: result.value });
    return result;
  },

  trimClip: (clipId, edge, newTime) => {
    const result = trimClipOp(get().document, clipId, edge, newTime);
    if (result.ok) set({ document: result.value });
    return result;
  },

  splitClip: (clipId, atTime) => {
    const result = splitClipOp(get().document, clipId, atTime);
    if (result.ok) set({ document: result.value });
    return result;
  },

  reset: () => set({ document: createEmptyTimeline() }),
}));
