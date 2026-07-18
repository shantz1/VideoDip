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
  /** Ephemeral renderer-only style drafts; never serialized or added to history. */
  readonly stylePreviews: Readonly<Record<string, Partial<SubtitleStyle>>>;
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
  /** Updates a live style draft without touching document history. */
  readonly previewStyle: (id: SegmentId, patch: Partial<SubtitleStyle>) => void;
  /** Applies the accumulated style draft as one undoable document edit. */
  readonly commitStylePreview: (id: SegmentId) => Result<SubtitleDocument>;
  /** Discards an uncommitted style draft. */
  readonly cancelStylePreview: (id: SegmentId) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
  readonly load: (document: SubtitleDocument) => void;
}

/** Undoable subtitle editor state kept independent of React and host adapters. */
export const useSubtitleStore = create<SubtitleState>()((set, get) => ({
  document: createSubtitleDocument(),
  stylePreviews: {},
  past: [],
  future: [],

  select: (selectedSegmentId) => useEditorStore.getState().selectSubtitle(selectedSegmentId),
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
    commit(
      { ...get().document, language: normalizedLanguage },
      useEditorStore.getState().selectedSubtitleId,
    );
  },
  setDefaultStyle: (defaultStyle) =>
    commit({ ...get().document, defaultStyle }, useEditorStore.getState().selectedSubtitleId),
  previewStyle: (id, patch) =>
    set((state) => ({
      stylePreviews: {
        ...state.stylePreviews,
        [id]: { ...state.stylePreviews[id], ...patch },
      },
    })),
  commitStylePreview: (id) => {
    const preview = get().stylePreviews[id];
    if (!preview) return { ok: true, value: get().document };
    set((state) => ({ stylePreviews: withoutPreview(state.stylePreviews, id) }));
    const result = updateSegment(get().document, id, { style: preview });
    if (result.ok) commit(result.value, id);
    return result;
  },
  cancelStylePreview: (id) =>
    set((state) => ({ stylePreviews: withoutPreview(state.stylePreviews, id) })),
  undo: () => {
    const state = get();
    const previous = state.past.at(-1);
    if (!previous) return;
    set({
      document: previous,
      stylePreviews: {},
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
    });
    useEditorStore.getState().selectSubtitle(previous.segments[0]?.id ?? null);
    useEditorStore.getState().markDirty();
  },
  redo: () => {
    const state = get();
    const [next, ...future] = state.future;
    if (!next) return;
    set({
      document: next,
      stylePreviews: {},
      past: [...state.past, state.document],
      future,
    });
    useEditorStore.getState().selectSubtitle(next.segments[0]?.id ?? null);
    useEditorStore.getState().markDirty();
  },
  reset: () => {
    set({ document: createSubtitleDocument(), stylePreviews: {}, past: [], future: [] });
    useEditorStore.getState().selectSubtitle(null);
    syncDuration(createSubtitleDocument());
  },
  load: (document) => {
    set({ document, stylePreviews: {}, past: [], future: [] });
    useEditorStore.getState().selectSubtitle(null);
    syncDuration(document);
  },
}));

function commit(document: SubtitleDocument, selectedSegmentId: SegmentId | null): void {
  const state = useSubtitleStore.getState();
  useSubtitleStore.setState({
    document,
    stylePreviews: {},
    past: [...state.past, state.document],
    future: [],
  });
  useEditorStore.getState().selectSubtitle(selectedSegmentId);
  useEditorStore.getState().markDirty();
  syncDuration(document);
}

function withoutPreview(
  previews: Readonly<Record<string, Partial<SubtitleStyle>>>,
  id: SegmentId,
): Readonly<Record<string, Partial<SubtitleStyle>>> {
  const next = { ...previews };
  delete next[id];
  return next;
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
