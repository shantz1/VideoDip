'use client';

import type { Milliseconds } from '@videodip/shared';
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

  // --- Project ---
  /** PLACEHOLDER. Null until the project manager exists. */
  readonly projectName: string | null;
  /** Drives the "saved / unsaved" indicator. Autosave will own this. */
  readonly isDirty: boolean;

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
}

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

  projectName: null,
  isDirty: false,

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
}));
