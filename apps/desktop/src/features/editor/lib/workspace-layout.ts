import type { WorkspaceLayout } from '../editor.store';

/**
 * Maps a workspace preset to named CSS grid regions.
 *
 * Short-video editing keeps both side panels beside the timeline so the
 * portrait preview retains vertical height. Video editing gives the timeline
 * the complete lower row for longer horizontal sequences.
 */
export function workspaceGridTemplate(layout: WorkspaceLayout): string {
  return layout === 'short-video'
    ? '"library preview inspector" "library timeline inspector"'
    : '"library preview inspector" "timeline timeline timeline"';
}
