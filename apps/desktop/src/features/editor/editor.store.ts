'use client';

import type { ExportPresetId, MediaItem } from '@videodip/media-engine';
import type { AssetId, Milliseconds, ProjectId } from '@videodip/shared';
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
 * Timeline selection and viewport (zoom, snapping) live in `session.store.ts`
 * — see `docs/timeline-engine-v2-phase-2-editing-session.md`.
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
export type AspectRatio = '9:16' | '3:4' | '4:5' | '1:1' | '16:9';

/** Filmora-style panel arrangements optimized for wide or vertical editing. */
export type WorkspaceLayout = 'video' | 'short-video';

/** Visual density for imported media; never persisted into the project. */
export type MediaLibraryView = 'grid' | 'list';

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
  /** User-dragged source-library width; `null` restores the workspace default. */
  readonly libraryPaneWidth: number | null;
  /** User-dragged inspector width; `null` restores the workspace default. */
  readonly inspectorPaneWidth: number | null;
  /** User-dragged timeline height; `null` restores the 40% workspace default. */
  readonly timelinePaneHeight: number | null;
  /** View-only presentation of imported media cards. */
  readonly mediaLibraryView: MediaLibraryView;
  /** Imported source temporarily auditioned instead of the timeline composition. */
  readonly mediaPreviewAssetId: AssetId | null;
  /** Instagram-oriented placement guides drawn over the stage. */
  readonly isInstagramSafeGridEnabled: boolean;
  /**
   * User-dragged width of the short-video stage pane in pixels; `null`
   * means the layout's proportional default. UI state, not project state —
   * a window-geometry preference does not belong in a saved project.
   */
  readonly stagePaneWidth: number | null;

  // --- Transport ---
  readonly isPlaying: boolean;
  readonly playhead: Milliseconds;
  /** Real content duration, synchronized from the timeline document. */
  readonly duration: Milliseconds;

  // --- Canvas ---
  /** Drives the preview stage's shape and, eventually, the export frame size. */
  readonly aspectRatio: AspectRatio;
  /** Named output encoding preference; UI-only until export starts. */
  readonly exportPresetId: ExportPresetId;

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
  /** Resizes the source library; clamped, `null` restores the workspace default. */
  readonly setLibraryPaneWidth: (width: number | null) => void;
  /** Resizes the inspector; clamped, `null` restores the workspace default. */
  readonly setInspectorPaneWidth: (width: number | null) => void;
  /** Resizes the lower timeline; clamped, `null` restores its default. */
  readonly setTimelinePaneHeight: (height: number | null) => void;
  /** Switches the imported-media presentation without editing project content. */
  readonly setMediaLibraryView: (view: MediaLibraryView) => void;
  /** Auditions an imported source and stops timeline playback; `null` returns to the timeline. */
  readonly setMediaPreview: (assetId: AssetId | null) => void;
  /** Shows or hides the Instagram placement guide without editing project content. */
  readonly toggleInstagramSafeGrid: () => void;
  /** Resizes the stage pane; clamped, `null` restores the layout default. */
  readonly setStagePaneWidth: (width: number | null) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly togglePlayback: () => void;
  readonly seek: (time: Milliseconds) => void;
  /** Moves the playhead by a delta, clamped to the project bounds. */
  readonly nudge: (delta: Milliseconds) => void;
  /** Synchronizes transport bounds after an undoable document edit. */
  readonly setProjectDuration: (duration: Milliseconds) => void;
  readonly setAspectRatio: (ratio: AspectRatio) => void;
  readonly setExportPreset: (id: ExportPresetId) => void;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Stage pane drag bounds in pixels. The floor keeps the preview usable; the
 * ceiling keeps the tools and timeline from being squeezed out entirely.
 */
const STAGE_PANE_MIN = 240;
const STAGE_PANE_MAX = 1280;

/** Side-pane bounds keep controls usable without starving the center preview. */
const SIDE_PANE_MIN = 240;
const SIDE_PANE_MAX = 560;
const TIMELINE_PANE_MIN = 120;
const TIMELINE_PANE_MAX = 1200;

export const useEditorStore = create<EditorState>()((set, get) => ({
  activePanel: 'media',
  sidebarCollapsed: false,
  inspectorTab: 'properties',
  inspectorCollapsed: false,
  workspaceLayout: 'video',
  libraryPaneWidth: null,
  inspectorPaneWidth: null,
  timelinePaneHeight: null,
  mediaLibraryView: 'grid',
  mediaPreviewAssetId: null,
  isInstagramSafeGridEnabled: false,
  stagePaneWidth: null,

  isPlaying: false,
  playhead: ms(0),
  duration: ms(0),

  aspectRatio: '9:16',
  exportPresetId: 'tiktok-vertical',

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

  setLibraryPaneWidth: (width) =>
    set({
      libraryPaneWidth:
        width === null ? null : Math.round(clamp(width, SIDE_PANE_MIN, SIDE_PANE_MAX)),
    }),

  setInspectorPaneWidth: (width) =>
    set({
      inspectorPaneWidth:
        width === null ? null : Math.round(clamp(width, SIDE_PANE_MIN, SIDE_PANE_MAX)),
    }),

  setTimelinePaneHeight: (height) =>
    set({
      timelinePaneHeight:
        height === null ? null : Math.round(clamp(height, TIMELINE_PANE_MIN, TIMELINE_PANE_MAX)),
    }),

  setMediaLibraryView: (mediaLibraryView) => set({ mediaLibraryView }),

  setMediaPreview: (mediaPreviewAssetId) => set({ mediaPreviewAssetId, isPlaying: false }),

  toggleInstagramSafeGrid: () =>
    set((state) => ({ isInstagramSafeGridEnabled: !state.isInstagramSafeGridEnabled })),

  setStagePaneWidth: (width) =>
    set({
      stagePaneWidth:
        width === null ? null : Math.round(clamp(width, STAGE_PANE_MIN, STAGE_PANE_MAX)),
    }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  seek: (time) =>
    set((state) => {
      const playhead = ms(clamp(time, 0, state.duration));
      // Remotion emits `frameupdate` after an imperative seek. Publishing an
      // unchanged playhead here makes the Player render again, which can emit
      // another frame update and recursively feed the same value back into
      // this store while the timeline playhead is being dragged.
      return state.playhead === playhead ? state : { playhead };
    }),

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

  setAspectRatio: (aspectRatio) =>
    set((state) =>
      state.aspectRatio === aspectRatio
        ? state
        : { aspectRatio, isDirty: true, editRevision: state.editRevision + 1 },
    ),
  setExportPreset: (exportPresetId) => set({ exportPresetId }),

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
      mediaItems: [],
      mediaPreviewAssetId: null,
    }));
  },

  restoreProject: (project) =>
    set({
      projectId: project.id,
      projectName: project.name,
      projectCreatedAt: project.createdAt,
      aspectRatio: project.aspectRatio,
      mediaItems: project.mediaItems,
      mediaPreviewAssetId: null,
      isPlaying: false,
      playhead: ms(0),
      isDirty: false,
      editRevision: 0,
    }),
}));
