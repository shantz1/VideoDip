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
  commitTimelineTransaction,
  createTimeline,
  createTimelineHistory,
  createTimelineRuntimeIndex,
  createTrack,
  getDuration,
  planTimelineEdit,
  redoTimelineHistory,
  undoTimelineHistory,
  type AddClipInput,
  type AddTransitionInput,
  type CreateTrackInput,
  type ClipKeyframe,
  type ClipAudioSettings,
  type TimelineDocument,
  type TimelineEditIntent,
  type TimelineHistory,
  type TimelineTransaction,
  type TrimEdge,
  type UpdateClipPropertiesInput,
  type UpdateTransitionInput,
  type UpdateTrackStateInput,
} from '@videodip/timeline';
import { create } from 'zustand';
import { useEditorStore } from './editor.store';
import { useSessionStore } from './session.store';
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
  readonly updateTrackState: (
    trackId: TrackId,
    patch: UpdateTrackStateInput,
  ) => Result<TimelineDocument>;
  readonly removeClip: (clipId: ClipId) => void;
  /** Removes every listed clip in a single transaction — one undo entry for the whole set. */
  readonly removeClips: (clipIds: readonly ClipId[]) => void;
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

  addClip: (input) => applyTimelineIntent({ type: 'clip.add', input }),

  addTransition: (input) => applyTimelineIntent({ type: 'transition.add', input }),

  addTrack: (input, index) =>
    applyTimelineIntent({
      type: 'track.add',
      input,
      ...(index === undefined ? {} : { index }),
    }),

  removeTrack: (trackId) => applyTimelineIntent({ type: 'track.remove', trackId }),

  reorderTrack: (trackId, index) => applyTimelineIntent({ type: 'track.reorder', trackId, index }),

  updateTrackState: (trackId, patch) =>
    applyTimelineIntent({ type: 'track.state.update', trackId, patch }),

  removeClip: (clipId) => {
    applyTimelineIntent({ type: 'clip.remove', clipIds: [clipId] });
  },

  removeClips: (clipIds) => {
    if (clipIds.length === 0) return;
    applyTimelineIntent({ type: 'clip.remove', clipIds });
  },

  removeTransition: (transitionId) => {
    applyTimelineIntent({ type: 'transition.remove', transitionId });
  },

  moveClip: (clipId, newStart, newTrackId) =>
    applyTimelineIntent({
      type: 'clip.move',
      clipId,
      start: newStart,
      ...(newTrackId === undefined ? {} : { trackId: newTrackId }),
    }),

  trimClip: (clipId, edge, newTime) =>
    applyTimelineIntent({ type: 'clip.trim', clipId, edge, time: newTime }),

  splitClip: (clipId, atTime) => applyTimelineIntent({ type: 'clip.split', clipId, time: atTime }),

  updateClipProperties: (clipId, patch) =>
    applyTimelineIntent({ type: 'clip.properties.update', clipId, patch }),

  setClipAnimation: (clipId, animation) =>
    applyTimelineIntent({ type: 'clip.animation.set', clipId, animation }),

  updateClipAudio: (clipId, patch) =>
    applyTimelineIntent({ type: 'clip.audio.update', clipId, patch }),

  updateTransition: (transitionId, patch) =>
    applyTimelineIntent({ type: 'transition.update', transitionId, patch }),

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
    useSessionStore.getState().resetSession();
    syncEditor(document);
  },

  load: (document) => {
    set(requireTimelineHistory(document));
    useSessionStore.getState().resetSession();
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

function applyTimelineIntent(intent: TimelineEditIntent): Result<TimelineDocument> {
  const state = useProjectStore.getState();
  const transaction = planTimelineEdit(state.document, intent);
  if (!transaction.ok) return transaction;
  const committed = commitTimelineTransaction(state, transaction.value);
  if (!committed.ok) return committed;
  if (committed.value === state) return ok(state.document);
  setProjectState(committed.value);
  syncEditor(committed.value.document);
  return ok(committed.value.document);
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
  const index = createTimelineRuntimeIndex(document);
  if (index.ok) {
    useSessionStore.getState().reconcile(index.value, {
      hasSubtitleSegment: (id) =>
        useSubtitleStore.getState().document.segments.some((segment) => segment.id === id),
    });
  }
  editor.setProjectDuration(
    Math.max(
      getDuration(document),
      useSubtitleStore.getState().document.segments.at(-1)?.end ?? 0,
    ) as Milliseconds,
  );
  if (dirty) editor.markDirty();
}
