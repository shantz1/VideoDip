'use client';

import {
  ok,
  type ClipId,
  type Milliseconds,
  type Result,
  type TrackId,
  type TransitionId,
} from '@videodip/shared';
import {
  addClip as addClipOp,
  addTransition as addTransitionOp,
  addTrack as addTrackOp,
  commitTimelineTransaction,
  createTimeline,
  createTimelineHistory,
  createTimelineTransaction,
  createTrack,
  getDuration,
  moveClip as moveClipOp,
  removeClip as removeClipOp,
  removeTrack as removeTrackOp,
  removeTransition as removeTransitionOp,
  redoTimelineHistory,
  reorderTrack as reorderTrackOp,
  setClipAnimation as setClipAnimationOp,
  splitClip as splitClipOp,
  trimClip as trimClipOp,
  updateClipProperties as updateClipPropertiesOp,
  updateClipAudio as updateClipAudioOp,
  updateTransition as updateTransitionOp,
  undoTimelineHistory,
  type AddClipInput,
  type AddTransitionInput,
  type CreateTrackInput,
  type ClipKeyframe,
  type ClipAudioSettings,
  type TimelineDocument,
  type TimelineHistory,
  type TimelineTransaction,
  type TrimEdge,
  type UpdateClipPropertiesInput,
  type UpdateTransitionInput,
} from '@videodip/timeline';
import { create } from 'zustand';
import { useEditorStore } from './editor.store';
import { useSubtitleStore } from './subtitle.store';

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
  readonly past: readonly TimelineTransaction[];
  readonly future: readonly TimelineTransaction[];
  readonly addClip: (input: AddClipInput) => Result<TimelineDocument>;
  readonly addTransition: (input: AddTransitionInput) => Result<TimelineDocument>;
  readonly addTrack: (input: CreateTrackInput, index?: number) => Result<TimelineDocument>;
  readonly removeTrack: (trackId: TrackId) => Result<TimelineDocument>;
  readonly reorderTrack: (trackId: TrackId, index: number) => Result<TimelineDocument>;
  readonly removeClip: (clipId: ClipId) => void;
  readonly removeTransition: (transitionId: TransitionId) => void;
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
  readonly updateClipProperties: (
    clipId: ClipId,
    patch: UpdateClipPropertiesInput,
  ) => Result<TimelineDocument>;
  readonly setClipAnimation: (
    clipId: ClipId,
    animation: readonly ClipKeyframe[],
  ) => Result<TimelineDocument>;
  readonly updateClipAudio: (
    clipId: ClipId,
    patch: Partial<ClipAudioSettings>,
  ) => Result<TimelineDocument>;
  readonly updateTransition: (
    transitionId: TransitionId,
    patch: UpdateTransitionInput,
  ) => Result<TimelineDocument>;
  /** Restores the previous document snapshot, if one exists. */
  readonly undo: () => void;
  /** Reapplies the next document snapshot after an undo, if one exists. */
  readonly redo: () => void;
  /** Discards the current document and starts a fresh, empty one. */
  readonly reset: () => void;
  /** Replaces the document from validated persistence and clears edit history. */
  readonly load: (document: TimelineDocument) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  document: createEditorTimeline(),
  past: [],
  future: [],

  addClip: (input) => {
    const result = addClipOp(get().document, input);
    if (result.ok) applyDocument(result.value, 'Add clip');
    return result;
  },

  addTransition: (input) => {
    const result = addTransitionOp(get().document, input);
    if (result.ok) applyDocument(result.value, 'Add transition');
    return result;
  },

  addTrack: (input, index) => {
    const result = addTrackOp(get().document, input, index);
    if (result.ok) applyDocument(result.value, 'Add track');
    return result;
  },

  removeTrack: (trackId) => {
    const result = removeTrackOp(get().document, trackId);
    if (result.ok) applyDocument(result.value, 'Remove track');
    return result;
  },

  reorderTrack: (trackId, index) => {
    const result = reorderTrackOp(get().document, trackId, index);
    if (result.ok) applyDocument(result.value, 'Reorder track');
    return result;
  },

  removeClip: (clipId) => {
    const before = get().document;
    const next = removeClipOp(before, clipId);
    if (next !== before) applyDocument(next, 'Remove clip');
  },

  removeTransition: (transitionId) => {
    const before = get().document;
    const next = removeTransitionOp(before, transitionId);
    if (next !== before) applyDocument(next, 'Remove transition');
  },

  moveClip: (clipId, newStart, newTrackId) => {
    const result = moveClipOp(get().document, clipId, newStart, newTrackId);
    if (result.ok) applyDocument(result.value, 'Move clip');
    return result;
  },

  trimClip: (clipId, edge, newTime) => {
    const result = trimClipOp(get().document, clipId, edge, newTime);
    if (result.ok) applyDocument(result.value, 'Trim clip');
    return result;
  },

  splitClip: (clipId, atTime) => {
    const result = splitClipOp(get().document, clipId, atTime);
    if (result.ok) applyDocument(result.value, 'Split clip');
    return result;
  },

  updateClipProperties: (clipId, patch) => {
    const result = updateClipPropertiesOp(get().document, clipId, patch);
    if (result.ok) applyDocument(result.value, 'Update clip properties');
    return result;
  },

  setClipAnimation: (clipId, animation) => {
    const result = setClipAnimationOp(get().document, clipId, animation);
    if (result.ok) applyDocument(result.value, 'Set clip animation');
    return result;
  },

  updateClipAudio: (clipId, patch) => {
    const result = updateClipAudioOp(get().document, clipId, patch);
    if (result.ok) applyDocument(result.value, 'Update clip audio');
    return result;
  },

  updateTransition: (transitionId, patch) => {
    const result = updateTransitionOp(get().document, transitionId, patch);
    if (result.ok) applyDocument(result.value, 'Update transition');
    return result;
  },

  undo: () => {
    const state = get();
    const history = undoTimelineHistory(state);
    if (history === state) return;
    set(history);
    syncEditor(history.document);
  },

  redo: () => {
    const state = get();
    const history = redoTimelineHistory(state);
    if (history === state) return;
    set(history);
    syncEditor(history.document);
  },

  reset: () => {
    const document = createEditorTimeline();
    set(requireTimelineHistory(document));
    syncEditor(document);
  },

  load: (document) => {
    set(requireTimelineHistory(document));
    syncEditor(document, false);
  },
}));

/** Desktop starter layout; a presentation preset, not a timeline invariant. */
function createEditorTimeline(): TimelineDocument {
  return createTimeline([
    createTrack({ id: 'subtitle' as TrackId, kind: 'subtitle', label: 'Subtitles' }),
    createTrack({ id: 'video' as TrackId, kind: 'video', label: 'Video' }),
    createTrack({ id: 'audio' as TrackId, kind: 'audio', label: 'Audio' }),
  ]);
}

function applyDocument(document: TimelineDocument, label: string): void {
  const state = useProjectStore.getState();
  const transaction = createTimelineTransaction(state.document, {
    label,
    operations: [() => ok(document)],
  });
  if (!transaction.ok) return;
  const committed = commitTimelineTransaction(state, transaction.value);
  if (!committed.ok || committed.value === state) return;
  setProjectState(committed.value);
  syncEditor(document);
}

function setProjectState(state: TimelineHistory): void {
  useProjectStore.setState(state);
}

function requireTimelineHistory(document: TimelineDocument): TimelineHistory {
  const history = createTimelineHistory(document);
  if (!history.ok) throw new Error(history.error.message);
  return history.value;
}

function syncEditor(document: TimelineDocument, dirty = true): void {
  const editor = useEditorStore.getState();
  if (
    editor.selectedTransitionId !== null &&
    !document.transitions.some((transition) => transition.id === editor.selectedTransitionId)
  ) {
    editor.selectTransition(null);
  }
  editor.setProjectDuration(
    Math.max(
      getDuration(document),
      useSubtitleStore.getState().document.segments.at(-1)?.end ?? 0,
    ) as Milliseconds,
  );
  if (dirty) editor.markDirty();
}
