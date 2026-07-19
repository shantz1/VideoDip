import { describe, expect, it } from 'vitest';
import { workspaceGridTemplate, workspaceTimelineRows } from './workspace-layout';

describe('workspaceGridTemplate', () => {
  it('gives short-video the full-height right-side preview with tools on the left', () => {
    expect(workspaceGridTemplate('short-video')).toEqual({
      areas: '"library inspector preview" "timeline timeline preview"',
      columns: '320px minmax(0, 1fr) minmax(0, 34vw)',
    });
  });

  it('keeps the middle workspace column inside the timeline span in both layouts', () => {
    // The standard default is an exact 40% center. Once a side pane is
    // resized/collapsed it becomes flexible, and the timeline must continue
    // to cover that middle column in either layout.
    for (const layout of ['short-video', 'video'] as const) {
      const { areas } = workspaceGridTemplate(layout);
      const bottomRow = /"[^"]+" "([^"]+)"/.exec(areas)?.[1] ?? '';
      expect(bottomRow.split(' ')[1]).toBe('timeline');
    }

    expect(workspaceGridTemplate('video', { libraryPaneWidth: 400 }).columns).toContain(
      'minmax(0, 1fr)',
    );
  });

  it('gives standard video editing a center preview and full-width lower timeline', () => {
    expect(workspaceGridTemplate('video')).toEqual({
      areas: '"library preview inspector" "timeline timeline timeline"',
      columns: 'minmax(240px, 30%) minmax(320px, 40%) minmax(240px, 30%)',
    });
  });

  it('applies resized and collapsed side-pane geometry', () => {
    expect(
      workspaceGridTemplate('video', {
        libraryPaneWidth: 400,
        inspectorPaneWidth: 360,
      }).columns,
    ).toBe('400px minmax(0, 1fr) 360px');

    expect(
      workspaceGridTemplate('video', {
        isLibraryCollapsed: true,
        isInspectorCollapsed: true,
      }).columns,
    ).toBe('auto minmax(0, 1fr) 0px');
  });
});

describe('workspaceTimelineRows', () => {
  it('uses forty percent by default and a dragged pixel height afterward', () => {
    expect(workspaceTimelineRows(null)).toBe('minmax(0, 1fr) 40%');
    expect(workspaceTimelineRows(420)).toBe('minmax(0, 1fr) 420px');
  });
});
