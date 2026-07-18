import { describe, expect, it } from 'vitest';
import { workspaceGridTemplate } from './workspace-layout';

describe('workspaceGridTemplate', () => {
  it('gives short-video the full-height right-side preview with tools on the left', () => {
    expect(workspaceGridTemplate('short-video')).toEqual({
      areas: '"library inspector preview" "timeline timeline preview"',
      columns: 'auto minmax(0, 1fr) minmax(0, 34vw)',
    });
  });

  it('keeps the flexible middle track inside the timeline span in both layouts', () => {
    // Collapsing a side panel must widen the timeline, never shrink it: the
    // `1fr` track is always the middle column, so the timeline area must
    // cover the middle cell of the bottom row in every layout.
    for (const layout of ['short-video', 'video'] as const) {
      const { areas, columns } = workspaceGridTemplate(layout);
      expect(columns.split(' minmax')[1]).toContain('1fr');
      const bottomRow = /"[^"]+" "([^"]+)"/.exec(areas)?.[1] ?? '';
      expect(bottomRow.split(' ')[1]).toBe('timeline');
    }
  });

  it('gives standard video editing a center preview and full-width lower timeline', () => {
    expect(workspaceGridTemplate('video')).toEqual({
      areas: '"library preview inspector" "timeline timeline timeline"',
      columns: 'auto minmax(0, 1fr) auto',
    });
  });
});
