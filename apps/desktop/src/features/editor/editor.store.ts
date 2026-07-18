'use client';

import type { ExportPresetId, MediaItem } from '@videodip/media-engine';
import type { ClipId, Milliseconds, ProjectId, TransitionId } from '@videodip/shared';
import { ms } from '@videodip/shared';
import { create } from 'zustand';

/**
 * Editor shell state.
 *
 * Scope: layout and transport only — which panel is open, where the playhead
 * is, whether we are playing. It deliberately does NOT hold the project
 * document (clips, tracks, subtitles). That belongs in the timeline domain
 * model, which is framework-free and undoable; mixing "is the sidebar open"
 * into the same store as "what the user edited" is how undo ends up restoring
 * panel widths.
 *
 */

/** Left sidebar sections, per the product brief. */
export type SidebarPanel =
  | 'projects'
  | 'media'
  | 'templates'
  | 'ai'
  | 'assets'
  | 'fonts'
  | 'plugins'
  | 'settings';

/**
 * Supported preview/export aspect ratios.
 *
 * A project-level setting, not a per-clip property — it belongs here rather
 * than in the timeline domain model's per-clip data, same reasoning as
 * `zoom`: it describes how the project is viewed, not what the project is.
 */
export type AspectRatio = '9:16' | '3:4' | '4:5' | '16:9';

/** Filmora-style panel arrangements optimized for wide or vertical editing. */
export type WorkspaceLayout = 'video' | 'short-video';

/** Right inspector tabs. */
export type InspectorTab =
  | 'properties'
  | 'animation'
  | 'subtitle'
  | 'transform'
  | 'effects'
  | 'audio';

export interface RestoredEditorProject {
  readonly id: ProjectId;
  readonly name: string;
  readonly aspectRatio: AspectRatio;
  readonly mediaItems: readonly MediaItem[];
  readonly createdAt: string;
}

export interface EditorState {
  // --- Layout ---
  readonly activePanel: SidebarPanel;
  readonly sidebarCollapsed: boolean;
  readonly inspectorTab: InspectorTab;
  readonly inspectorCollapsed: boolean;
  readonly workspaceLayout: WorkspaceLayout;

  // --- Transport ---
  readonly isPlaying: boolean;
  readonly playhead: Milliseconds;
  /** Real content duration, synchronized from the timeline document. */
  readonly duration: Milliseconds;

  // --- Timeline view ---
  /** Pixels per second. Drives the ruler and clip widths. */
  readonly zoom: number;
  readonly snapEnabled: boolean;

  // --- Canvas ---
  /** Drives the preview stage's shape and, eventually, the export frame size. */
  readonly aspectRatio: AspectRatio;
  /** Named output encoding preference; UI-only until export starts. */
  readonly exportPresetId: ExportPresetId;

  // --- Selection ---
  /**
   * The clip the timeline toolbar's Split/Delete act on.
   *
   * Lives here, not in the project document (`project.store.ts`) — which
   * clip is selected is a UI concern, not something worth an undo entry of
   * its own.
   */
  readonly selectedClipId: ClipId | null;
  /** The transition cut currently edited in the Effects inspector. */
  readonly selectedTransitionId: TransitionId | null;

  // --- Project ---
  /** Null until a project is created or loaded. */
  readonly projectId: ProjectId | null;
  readonly projectName: string | null;
  readonly projectCreatedAt: string | null;
  /** Monotonic edit counter used to prevent an older save clearing newer work. */
  readonly editRevision: number;
  /** Drives the "saved / unsaved" indicator. */
  readonly isDirty: boolean;

  // --- Media pool ---
  /**
   * Media the user has imported, not yet placed on any timeline. This is the
   * source library, distinct from the project document (clips, tracks,
   * subtitles) that this store deliberately excludes — importing a file and
   * placing it are different actions with different undo semantics.
   */
  readonly mediaItems: readonly MediaItem[];

  // --- Actions ---
  readonly setActivePanel: (panel: SidebarPanel) => void;
  readonly toggleSidebar: () => void;
  readonly setInspectorTab: (tab: InspectorTab) => void;
  readonly toggleInspector: () => void;
  /** Applies a complete panel arrangement without editing project content. */
  readonly setWorkspaceLayout: (layout: WorkspaceLayout) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly togglePlayback: () => void;
  readonly seek: (time: Milliseconds) => void;
  /** Moves the playhead by a delta, clamped to the project bounds. */
  readonly nudge: (delta: Milliseconds) => void;
  /** Synchronizes transport bounds after an undoable document edit. */
  readonly setProjectDuration: (duration: Milliseconds) => void;
  readonly setZoom: (zoom: number) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly toggleSnap: () => void;
  readonly setAspectRatio: (ratio: AspectRatio) => void;
  readonly setExportPreset: (id: ExportPresetId) => void;
  readonly selectClip: (clipId: ClipId | null) => void;
  readonly selectTransition: (transitionId: TransitionId | null) => void;
  readonly addMediaItems: (items: readonly MediaItem[]) => void;
  /** Marks the in-memory project as changed since its last persisted state. */
  readonly markDirty: () => void;
  /** Clears dirty state only if the completed save matches the latest edit. */
  readonly markSaved: (revision: number) => void;
  /** Changes the durable display name and records it as an edit. */
  readonly renameProject: (name: string) => void;
  /**
   * Starts a new, unnamed, in-memory project.
   *
   * No persistence yet — `packages/timeline` doesn't exist. Auto-increments
   * "Untitled project" so repeated clicks are visibly distinct rather than a
   * no-op.
   */
  readonly newProject: (identity?: { id: ProjectId; createdAt: string }) => void;
  /** Restores persisted shell/media state without manufacturing an edit. */
  readonly restoreProject: (project: RestoredEditorProject) => void;
}

const UNTITLED_PROJECT_PATTERN = /^Untitled project(?: (\d+))?$/;

/** Zoom bounds in pixels per second. */
const ZOOM_MIN = 5;
const ZOOM_MAX = 400;
const ZOOM_DEFAULT = 50;
const ZOOM_STEP = 1.3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useEditorStore = create<EditorState>()((set, get) => ({
  activePanel: 'media',
  sidebarCollapsed: false,
  inspectorTab: 'properties',
  inspectorCollapsed: false,
  workspaceLayout: 'short-video',

  isPlaying: false,
  playhead: ms(0),
  duration: ms(0),

  zoom: ZOOM_DEFAULT,
  snapEnabled: true,

  aspectRatio: '9:16',
  exportPresetId: 'tiktok-vertical',

  selectedClipId: null,
  selectedTransitionId: null,

  projectId: null,
  projectName: null,
  projectCreatedAt: null,
  editRevision: 0,
  isDirty: false,

  mediaItems: [],

  setActivePanel: (activePanel) =>
    set((state) => ({
      activePanel,
      // Selecting a panel while collapsed should reveal it — otherwise the
      // click appears to do nothing.
      sidebarCollapsed: state.activePanel === activePanel ? state.sidebarCollapsed : false,
    })),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setInspectorTab: (inspectorTab) => set({ inspectorTab, inspectorCollapsed: false }),

  toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),

  setWorkspaceLayout: (workspaceLayout) =>
    set({
      workspaceLayout,
      sidebarCollapsed: false,
      inspectorCollapsed: false,
    }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  seek: (time) => set((state) => ({ playhead: ms(clamp(time, 0, state.duration)) })),

  nudge: (delta) => {
    const { playhead, duration } = get();
    set({ playhead: ms(clamp(playhead + delta, 0, duration)) });
  },

  setProjectDuration: (duration) =>
    set((state) => ({
      duration,
      playhead: ms(clamp(state.playhead, 0, duration)),
      isPlaying: duration > 0 && state.playhead < duration ? state.isPlaying : false,
    })),

  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) }),

  // Multiplicative steps, not additive: zoom is perceptually logarithmic, so a
  // fixed +10px/s step feels enormous when zoomed out and useless when in.
  zoomIn: () => set((state) => ({ zoom: clamp(state.zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
  zoomOut: () => set((state) => ({ zoom: clamp(state.zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  setAspectRatio: (aspectRatio) =>
    set((state) =>
      state.aspectRatio === aspectRatio
        ? state
        : { aspectRatio, isDirty: true, editRevision: state.editRevision + 1 },
    ),
  setExportPreset: (exportPresetId) => set({ exportPresetId }),

  selectClip: (selectedClipId) => set({ selectedClipId, selectedTransitionId: null }),
  selectTransition: (selectedTransitionId) =>
    set({
      selectedTransitionId,
      ...(selectedTransitionId === null ? {} : { selectedClipId: null }),
    }),

  addMediaItems: (items) => {
    if (items.length === 0) return;
    set((state) => ({
      mediaItems: [...state.mediaItems, ...items],
      isDirty: true,
      editRevision: state.editRevision + 1,
    }));
  },

  markDirty: () => set((state) => ({ isDirty: true, editRevision: state.editRevision + 1 })),

  markSaved: (revision) =>
    set((state) => (state.editRevision === revision ? { isDirty: false } : state)),

  renameProject: (name) =>
    set((state) =>
      state.projectName === name
        ? state
        : { projectName: name, isDirty: true, editRevision: state.editRevision + 1 },
    ),

  newProject: (identity) => {
    const match = get().projectName?.match(UNTITLED_PROJECT_PATTERN);
    const next = match ? Number(match[1] ?? '1') + 1 : 1;
    const projectIdentity = identity ?? {
      id: crypto.randomUUID() as ProjectId,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      projectId: projectIdentity.id,
      projectName: next === 1 ? 'Untitled project' : `Untitled project ${next}`,
      projectCreatedAt: projectIdentity.createdAt,
      isDirty: true,
      editRevision: state.editRevision + 1,
      selectedClipId: null,
      selectedTransitionId: null,
      mediaItems: [],
    }));
  },

  restoreProject: (project) =>
    set({
      projectId: project.id,
      projectName: project.name,
      projectCreatedAt: project.createdAt,
      aspectRatio: project.aspectRatio,
      mediaItems: project.mediaItems,
      selectedClipId: null,
      selectedTransitionId: null,
      isPlaying: false,
      playhead: ms(0),
      isDirty: false,
      editRevision: 0,
    }),
}));
