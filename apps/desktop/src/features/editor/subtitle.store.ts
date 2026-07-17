'use client';

import {
  addSubtitleSegment as addSegment,
  createSubtitleDocument,
  removeSubtitleSegment as removeSegment,
  splitSubtitleSegment as splitSegment,
  updateSubtitleSegment as updateSegment,
  type AddSubtitleSegmentInput,
  type SubtitleDocument,
  type SubtitleSegment,
  type SubtitleStyle,
} from '@videodip/subtitle-engine';
import { ms, type Milliseconds, type Result, type SegmentId } from '@videodip/shared';
import { getDuration } from '@videodip/timeline';
import { create } from 'zustand';
import { useEditorStore } from './editor.store';
import { useProjectStore } from './project.store';

interface SubtitleState {
  readonly document: SubtitleDocument;
  readonly selectedSegmentId: SegmentId | null;
  readonly past: readonly SubtitleDocument[];
  readonly future: readonly SubtitleDocument[];
  readonly select: (id: SegmentId | null) => void;
  readonly add: (input: AddSubtitleSegmentInput) => Result<SubtitleDocument>;
  readonly update: (
    id: SegmentId,
    patch: Partial<Omit<SubtitleSegment, 'id'>>,
  ) => Result<SubtitleDocument>;
  readonly remove: (id: SegmentId) => void;
  readonly split: (id: SegmentId, at: Milliseconds) => Result<SubtitleDocument>;
  readonly replace: (document: SubtitleDocument) => void;
  readonly setLanguage: (language: string | null) => void;
  readonly setDefaultStyle: (style: SubtitleStyle) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
  readonly load: (document: SubtitleDocument) => void;
}

/** Undoable subtitle editor state kept independent of React and host adapters. */
export const useSubtitleStore = create<SubtitleState>()((set, get) => ({
  document: createSubtitleDocument(),
  selectedSegmentId: null,
  past: [],
  future: [],

  select: (selectedSegmentId) => set({ selectedSegmentId }),
  add: (input) => {
    const result = addSegment(get().document, input);
    if (result.ok) {
      const added = result.value.segments.find(
        (segment) => !get().document.segments.some((current) => current.id === segment.id),
      );
      commit(result.value, added?.id ?? null);
    }
    return result;
  },
  update: (id, patch) => {
    const result = updateSegment(get().document, id, patch);
    if (result.ok) commit(result.value, id);
    return result;
  },
  remove: (id) => {
    const current = get().document;
    const next = removeSegment(current, id);
    if (next.segments.length !== current.segments.length) commit(next, null);
  },
  split: (id, at) => {
    const result = splitSegment(get().document, id, at);
    if (result.ok)
      commit(result.value, result.value.segments.find((cue) => cue.start === at)?.id ?? id);
    return result;
  },
  replace: (document) => commit(document, document.segments[0]?.id ?? null),
  setLanguage: (language) => {
    const normalizedLanguage = language?.trim() || null;
    if (normalizedLanguage === get().document.language) return;
    commit({ ...get().document, language: normalizedLanguage }, get().selectedSegmentId);
  },
  setDefaultStyle: (defaultStyle) =>
    commit({ ...get().document, defaultStyle }, get().selectedSegmentId),
  undo: () => {
    const state = get();
    const previous = state.past.at(-1);
    if (!previous) return;
    set({
      document: previous,
      selectedSegmentId: previous.segments[0]?.id ?? null,
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
    });
    useEditorStore.getState().markDirty();
  },
  redo: () => {
    const state = get();
    const [next, ...future] = state.future;
    if (!next) return;
    set({
      document: next,
      selectedSegmentId: next.segments[0]?.id ?? null,
      past: [...state.past, state.document],
      future,
    });
    useEditorStore.getState().markDirty();
  },
  reset: () => {
    set({ document: createSubtitleDocument(), selectedSegmentId: null, past: [], future: [] });
    syncDuration(createSubtitleDocument());
  },
  load: (document) => {
    set({ document, selectedSegmentId: null, past: [], future: [] });
    syncDuration(document);
  },
}));

function commit(document: SubtitleDocument, selectedSegmentId: SegmentId | null): void {
  const state = useSubtitleStore.getState();
  useSubtitleStore.setState({
    document,
    selectedSegmentId,
    past: [...state.past, state.document],
    future: [],
  });
  useEditorStore.getState().markDirty();
  syncDuration(document);
}

function syncDuration(document: SubtitleDocument): void {
  useEditorStore
    .getState()
    .setProjectDuration(
      ms(
        Math.max(
          getDuration(useProjectStore.getState().document),
          document.segments.at(-1)?.end ?? 0,
        ),
      ),
    );
}
