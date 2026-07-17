'use client';

import type { MediaItem } from '@videodip/media-engine';
import type { ClipId, Milliseconds } from '@videodip/shared';
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
 * Placeholder state is marked. It exists so the shell can render real
 * interactions before the engines land, and it must be replaced rather than
 * built upon.
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

/** Right inspector tabs. */
export type InspectorTab =
  | 'properties'
  | 'animation'
  | 'subtitle'
  | 'transform'
  | 'effects'
  | 'audio';

export interface EditorState {
  // --- Layout ---
  readonly activePanel: SidebarPanel;
  readonly sidebarCollapsed: boolean;
  readonly inspectorTab: InspectorTab;
  readonly inspectorCollapsed: boolean;

  // --- Transport ---
  readonly isPlaying: boolean;
  readonly playhead: Milliseconds;
  /**
   * PLACEHOLDER. Real duration comes from the loaded project once
   * `packages/timeline` exists. Hardcoded so the ruler and playhead have
   * something to scale against.
   */
  readonly duration: Milliseconds;

  // --- Timeline view ---
  /** Pixels per second. Drives the ruler and clip widths. */
  readonly zoom: number;
  readonly snapEnabled: boolean;

  // --- Canvas ---
  /** Drives the preview stage's shape and, eventually, the export frame size. */
  readonly aspectRatio: AspectRatio;

  // --- Selection ---
  /**
   * The clip the timeline toolbar's Split/Delete act on.
   *
   * Lives here, not in the project document (`project.store.ts`) — which
   * clip is selected is a UI concern, not something worth an undo entry of
   * its own.
   */
  readonly selectedClipId: ClipId | null;

  // --- Project ---
  /** PLACEHOLDER. Null until the project manager exists. */
  readonly projectName: string | null;
  /** Drives the "saved / unsaved" indicator. Autosave will own this. */
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
  readonly play: () => void;
  readonly pause: () => void;
  readonly togglePlayback: () => void;
  readonly seek: (time: Milliseconds) => void;
  /** Moves the playhead by a delta, clamped to the project bounds. */
  readonly nudge: (delta: Milliseconds) => void;
  readonly setZoom: (zoom: number) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly toggleSnap: () => void;
  readonly setAspectRatio: (ratio: AspectRatio) => void;
  readonly selectClip: (clipId: ClipId | null) => void;
  readonly addMediaItems: (items: readonly MediaItem[]) => void;
  /**
   * Starts a new, unnamed, in-memory project.
   *
   * No persistence yet — `packages/timeline` doesn't exist. Auto-increments
   * "Untitled project" so repeated clicks are visibly distinct rather than a
   * no-op.
   */
  readonly newProject: () => void;
}

const UNTITLED_PROJECT_PATTERN = /^Untitled project(?: (\d+))?$/;

/** Zoom bounds in pixels per second. */
const ZOOM_MIN = 5;
const ZOOM_MAX = 400;
const ZOOM_DEFAULT = 50;
const ZOOM_STEP = 1.3;

/** PLACEHOLDER duration: 60s. Replaced by the loaded project. */
const PLACEHOLDER_DURATION = ms(60_000);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useEditorStore = create<EditorState>()((set, get) => ({
  activePanel: 'media',
  sidebarCollapsed: false,
  inspectorTab: 'properties',
  inspectorCollapsed: false,

  isPlaying: false,
  playhead: ms(0),
  duration: PLACEHOLDER_DURATION,

  zoom: ZOOM_DEFAULT,
  snapEnabled: true,

  aspectRatio: '9:16',

  selectedClipId: null,

  projectName: null,
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

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  seek: (time) => set((state) => ({ playhead: ms(clamp(time, 0, state.duration)) })),

  nudge: (delta) => {
    const { playhead, duration } = get();
    set({ playhead: ms(clamp(playhead + delta, 0, duration)) });
  },

  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) }),

  // Multiplicative steps, not additive: zoom is perceptually logarithmic, so a
  // fixed +10px/s step feels enormous when zoomed out and useless when in.
  zoomIn: () => set((state) => ({ zoom: clamp(state.zoom * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
  zoomOut: () => set((state) => ({ zoom: clamp(state.zoom / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  setAspectRatio: (aspectRatio) => set({ aspectRatio }),

  selectClip: (selectedClipId) => set({ selectedClipId }),

  addMediaItems: (items) =>
    set((state) => ({ mediaItems: [...state.mediaItems, ...items] })),

  newProject: () => {
    const match = get().projectName?.match(UNTITLED_PROJECT_PATTERN);
    const next = match ? Number(match[1] ?? '1') + 1 : 1;
    set({
      projectName: next === 1 ? 'Untitled project' : `Untitled project ${next}`,
      isDirty: true,
      selectedClipId: null,
    });
  },
}));
