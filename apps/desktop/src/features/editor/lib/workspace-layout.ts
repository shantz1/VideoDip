import type { WorkspaceLayout } from '../editor.store';

/** Named grid regions plus the column sizing that makes them work. */
export interface WorkspaceGrid {
  /** CSS `grid-template-areas` value. */
  readonly areas: string;
  /** CSS `grid-template-columns` value, matched to the area order. */
  readonly columns: string;
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
 * Both side panels size themselves (fixed rails that collapse to nothing),
 * so their tracks are `auto`. The flexible track always lies inside the
 * timeline's span — collapsing a panel must widen the timeline, never
 * shrink it. The short-video stage is viewport-proportioned rather than
 * `1fr`: a full-height 9:16 frame only ever needs ~⅓ of the window width,
 * and every pixel past that is better spent on the timeline.
 */
export function workspaceGridTemplate(
  layout: WorkspaceLayout,
  stagePaneWidth: number | null = null,
): WorkspaceGrid {
  return layout === 'short-video'
    ? {
        areas: '"library inspector preview" "timeline timeline preview"',
        columns: `auto minmax(0, 1fr) minmax(0, ${
          stagePaneWidth === null ? '34vw' : `${stagePaneWidth}px`
        })`,
      }
    : {
        areas: '"library preview inspector" "timeline timeline timeline"',
        columns: 'auto minmax(0, 1fr) auto',
      };
}
