import type { WorkspaceLayout } from '../editor.store';

/** Named grid regions plus the column sizing that makes them work. */
export interface WorkspaceGrid {
  /** CSS `grid-template-areas` value. */
  readonly areas: string;
  /** CSS `grid-template-columns` value, matched to the area order. */
  readonly columns: string;
}

/** User-controlled pane geometry consumed by the workspace grid. */
export interface WorkspacePaneGeometry {
  readonly libraryPaneWidth?: number | null;
  readonly inspectorPaneWidth?: number | null;
  readonly stagePaneWidth?: number | null;
  readonly isLibraryCollapsed?: boolean;
  readonly isInspectorCollapsed?: boolean;
}

/** Pixel fallbacks used by keyboard resizing and the short-video workspace. */
export const DEFAULT_LIBRARY_PANE_WIDTH = 320;
export const DEFAULT_INSPECTOR_PANE_WIDTH = 320;

/** Standard editing starts at a deliberate 30 / 40 / 30 workspace balance. */
const DEFAULT_VIDEO_LIBRARY_COLUMN = 'minmax(240px, 30%)';
const DEFAULT_VIDEO_PREVIEW_COLUMN = 'minmax(320px, 40%)';
const DEFAULT_VIDEO_INSPECTOR_COLUMN = 'minmax(240px, 30%)';

/** Grid rows with a 40% default timeline or an explicit dragged pixel height. */
export function workspaceTimelineRows(timelinePaneHeight: number | null): string {
  return `minmax(0, 1fr) ${timelinePaneHeight === null ? '40%' : `${timelinePaneHeight}px`}`;
}

/**
 * Maps a workspace preset to a CSS grid.
 *
 * Short-video editing mirrors the layout every vertical-first NLE converges
 * on (Filmora, CapCut): tools on the left, timeline bottom-left, and the
 * portrait preview owning the full right side top to bottom — a 9:16 frame
 * is starved by a squat center stage but thrives on window height. Video
 * editing keeps the classic arrangement: center preview, right inspector,
 * and the complete lower row for long horizontal sequences.
 *
 * Standard video uses explicit user-resizable side columns around a flexible
 * center preview. Collapsing a panel widens the preview and timeline instead
 * of leaving a dead grid track. Short-video keeps its viewport-proportioned
 * stage because a full-height 9:16 frame only needs roughly one third of the
 * window width; its existing stage splitter owns that geometry.
 */
export function workspaceGridTemplate(
  layout: WorkspaceLayout,
  geometry: WorkspacePaneGeometry = {},
): WorkspaceGrid {
  if (layout === 'short-video') {
    const libraryColumn = geometry.isLibraryCollapsed
      ? 'auto'
      : `${geometry.libraryPaneWidth ?? DEFAULT_LIBRARY_PANE_WIDTH}px`;
    return {
      areas: '"library inspector preview" "timeline timeline preview"',
      columns: `${libraryColumn} minmax(0, 1fr) minmax(0, ${
        geometry.stagePaneWidth == null ? '34vw' : `${geometry.stagePaneWidth}px`
      })`,
    };
  }

  const libraryColumn = geometry.isLibraryCollapsed
    ? 'auto'
    : geometry.libraryPaneWidth === null || geometry.libraryPaneWidth === undefined
      ? DEFAULT_VIDEO_LIBRARY_COLUMN
      : `${geometry.libraryPaneWidth}px`;
  const inspectorColumn = geometry.isInspectorCollapsed
    ? '0px'
    : geometry.inspectorPaneWidth === null || geometry.inspectorPaneWidth === undefined
      ? DEFAULT_VIDEO_INSPECTOR_COLUMN
      : `${geometry.inspectorPaneWidth}px`;
  const previewColumn =
    geometry.libraryPaneWidth == null &&
    geometry.inspectorPaneWidth == null &&
    !geometry.isLibraryCollapsed &&
    !geometry.isInspectorCollapsed
      ? DEFAULT_VIDEO_PREVIEW_COLUMN
      : 'minmax(0, 1fr)';

  return {
    areas: '"library preview inspector" "timeline timeline timeline"',
    columns: `${libraryColumn} ${previewColumn} ${inspectorColumn}`,
  };
}
