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
import {
  createTimelineRuntimeIndex,
  getDuration,
  getSelectedSubtitleSegmentId,
} from '@videodip/timeline';
import { create } from 'zustand';
import { useEditorStore } from './editor.store';
import { useProjectStore } from './project.store';
import { useSessionStore } from './session.store';

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
  /** Removes several cues in one undoable document edit. */
  readonly removeMany: (ids: readonly SegmentId[]) => void;
  readonly split: (id: SegmentId, at: Milliseconds) => Result<SubtitleDocument>;
  readonly replace: (document: SubtitleDocument) => void;
  readonly setLanguage: (language: string | null) => void;
  readonly setDefaultStyle: (style: SubtitleStyle) => void;
  /** Applies one style patch to several cue overrides in one undo step. */
  readonly applyStyleToSegments: (
    ids: readonly SegmentId[],
    patch: Partial<SubtitleStyle>,
  ) => Result<SubtitleDocument>;
  /** Applies a style to the document default and every existing cue in one undo step. */
  readonly applyStyleToAll: (patch: Partial<SubtitleStyle>) => Result<SubtitleDocument>;
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

  select: (selectedSegmentId) => selectSubtitleSegment(selectedSegmentId),
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
  removeMany: (ids) => {
    const selectedIds = new Set(ids);
    if (selectedIds.size === 0) return;
    const current = get().document;
    const next = current.segments.filter((segment) => !selectedIds.has(segment.id));
    if (next.length === current.segments.length) return;
    commit({ ...current, segments: next }, null);
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
      getSelectedSubtitleSegmentId(useSessionStore.getState().session),
    );
  },
  setDefaultStyle: (defaultStyle) =>
    commit(
      { ...get().document, defaultStyle },
      getSelectedSubtitleSegmentId(useSessionStore.getState().session),
    ),
  applyStyleToSegments: (ids, patch) => {
    const selectedIds = [...new Set(ids)];
    let next = get().document;
    for (const id of selectedIds) {
      const result = updateSegment(next, id, { style: patch });
      if (!result.ok) return result;
      next = result.value;
    }
    if (selectedIds.length > 0) commit(next);
    return { ok: true, value: next };
  },
  applyStyleToAll: (patch) => {
    const current = get().document;
    let next: SubtitleDocument = {
      ...current,
      defaultStyle: { ...current.defaultStyle, ...patch },
    };
    for (const segment of current.segments) {
      const result = updateSegment(next, segment.id, { style: patch });
      if (!result.ok) return result;
      next = result.value;
    }
    commit(next);
    return { ok: true, value: next };
  },
  previewStyle: (id, patch) =>
    set((state) => {
      const current = state.stylePreviews[id] ?? {};
      const changed = Object.entries(patch).some(
        ([key, value]) => current[key as keyof SubtitleStyle] !== value,
      );
      if (!changed) return state;
      return {
        stylePreviews: {
          ...state.stylePreviews,
          [id]: { ...current, ...patch },
        },
      };
    }),
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
    reconcileSubtitleSelection(previous);
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
    reconcileSubtitleSelection(next);
    useEditorStore.getState().markDirty();
  },
  reset: () => {
    set({ document: createSubtitleDocument(), stylePreviews: {}, past: [], future: [] });
    selectSubtitleSegment(null);
    syncDuration(createSubtitleDocument());
  },
  load: (document) => {
    set({ document, stylePreviews: {}, past: [], future: [] });
    selectSubtitleSegment(null);
    syncDuration(document);
  },
}));

/**
 * Selects a subtitle segment (or clears one) in the shared editing session.
 *
 * Clearing only acts when the current selection is itself a subtitle
 * segment — a blanket clear would wipe an unrelated clip/transition
 * selection, which selectSubtitle(null) never did either under the old
 * single-field editor-store model.
 */
function selectSubtitleSegment(id: SegmentId | null): void {
  const sessionStore = useSessionStore.getState();
  if (id !== null) {
    sessionStore.select({ type: 'subtitle-segment', id });
  } else if (getSelectedSubtitleSegmentId(sessionStore.session) !== null) {
    sessionStore.clearSelection();
  }
}

function commit(document: SubtitleDocument, selectedSegmentId?: SegmentId | null): void {
  const state = useSubtitleStore.getState();
  useSubtitleStore.setState({
    document,
    stylePreviews: {},
    past: [...state.past, state.document],
    future: [],
  });
  if (selectedSegmentId !== undefined) selectSubtitleSegment(selectedSegmentId);
  useEditorStore.getState().markDirty();
  syncDuration(document);
}

/** Keeps every still-valid session ref selected across subtitle history changes. */
function reconcileSubtitleSelection(document: SubtitleDocument): void {
  const index = createTimelineRuntimeIndex(useProjectStore.getState().document);
  if (!index.ok) return;
  const segmentIds = new Set(document.segments.map((segment) => segment.id));
  useSessionStore.getState().reconcile(index.value, {
    hasSubtitleSegment: (id) => segmentIds.has(id),
  });
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
