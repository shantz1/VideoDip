import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms, type ProjectId } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor.store';

const initial = useEditorStore.getState();
const state = () => useEditorStore.getState();

const mediaItem = (locator: string) =>
  createMediaItem({
    locator: mediaLocatorSchema.parse(locator),
    name: locator.split('/').at(-1) ?? locator,
    kind: 'video',
  });

beforeEach(() => {
  useEditorStore.setState(initial, true);
});

describe('playhead', () => {
  beforeEach(() => {
    state().setProjectDuration(ms(2000));
  });

  it('seeks to a time', () => {
    state().seek(ms(1500));
    expect(state().playhead).toBe(1500);
  });

  it('clamps a seek past the end to the duration', () => {
    state().seek(ms(999_999));
    expect(state().playhead).toBe(state().duration);
  });

  it('clamps a negative seek to zero', () => {
    state().seek(ms(-500));
    expect(state().playhead).toBe(0);
  });

  it('does not publish when seeking to the current playhead', () => {
    state().seek(ms(1000));
    let notifications = 0;
    const unsubscribe = useEditorStore.subscribe(() => {
      notifications += 1;
    });

    state().seek(ms(1000));

    unsubscribe();
    expect(notifications).toBe(0);
  });

  it('nudges relative to the current position', () => {
    state().seek(ms(1000));
    state().nudge(ms(250));
    expect(state().playhead).toBe(1250);
  });

  it('clamps a backwards nudge at zero rather than going negative', () => {
    state().seek(ms(100));
    state().nudge(ms(-500));
    expect(state().playhead).toBe(0);
  });

  it('clamps the playhead when an edit shortens the project', () => {
    state().seek(ms(1500));
    state().setProjectDuration(ms(750));
    expect(state().playhead).toBe(750);
  });
});

describe('aspect ratio', () => {
  it('defaults to 9:16', () => {
    expect(state().aspectRatio).toBe('9:16');
  });

  it('switches to any supported ratio', () => {
    const revision = state().editRevision;
    state().setAspectRatio('16:9');
    expect(state().aspectRatio).toBe('16:9');
    expect(state().editRevision).toBe(revision + 1);
    expect(state().isDirty).toBe(true);

    state().setAspectRatio('4:5');
    expect(state().aspectRatio).toBe('4:5');

    state().setAspectRatio('1:1');
    expect(state().aspectRatio).toBe('1:1');
  });

  it('does not manufacture an edit when the ratio is unchanged', () => {
    state().setAspectRatio(state().aspectRatio);
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);
  });
});

describe('playback', () => {
  it('toggles', () => {
    expect(state().isPlaying).toBe(false);
    state().togglePlayback();
    expect(state().isPlaying).toBe(true);
    state().togglePlayback();
    expect(state().isPlaying).toBe(false);
  });
});

describe('layout', () => {
  it('switches media library views without recording a project edit', () => {
    expect(state().mediaLibraryView).toBe('grid');
    state().setMediaLibraryView('list');
    expect(state().mediaLibraryView).toBe('list');
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);
  });

  it('auditions media by stopping timeline playback without recording an edit', () => {
    state().play();
    state().setMediaPreview('asset-preview' as never);
    expect(state().mediaPreviewAssetId).toBe('asset-preview');
    expect(state().isPlaying).toBe(false);
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);

    state().setMediaPreview(null);
    expect(state().mediaPreviewAssetId).toBeNull();
  });

  it('toggles Instagram placement guides without recording a project edit', () => {
    state().toggleInstagramSafeGrid();
    expect(state().isInstagramSafeGridEnabled).toBe(true);
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);
  });

  it('starts in the center-preview video workspace', () => {
    expect(state().workspaceLayout).toBe('video');
  });

  it('applies a full video workspace without changing project content', () => {
    useEditorStore.setState({
      workspaceLayout: 'short-video',
      aspectRatio: '9:16',
      sidebarCollapsed: true,
      inspectorCollapsed: true,
    });

    state().setWorkspaceLayout('video');

    expect(state()).toMatchObject({
      workspaceLayout: 'video',
      aspectRatio: '9:16',
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      isDirty: false,
      editRevision: 0,
    });
  });

  it('leaves the active workspace unchanged while restoring a project', () => {
    useEditorStore.setState({ workspaceLayout: 'video' });

    state().restoreProject({
      id: 'restored-layout' as ProjectId,
      name: 'Portrait project',
      aspectRatio: '9:16',
      mediaItems: [],
      createdAt: '2026-07-18T00:00:00.000Z',
    });

    expect(state().workspaceLayout).toBe('video');
    expect(state().aspectRatio).toBe('9:16');
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);
  });

  it('reveals a collapsed sidebar when a different panel is selected', () => {
    // Otherwise the click appears to do nothing.
    useEditorStore.setState({ sidebarCollapsed: true, activePanel: 'media' });
    state().setActivePanel('templates');

    expect(state().sidebarCollapsed).toBe(false);
    expect(state().activePanel).toBe('templates');
  });

  it('leaves a collapsed sidebar collapsed when the active panel is re-selected', () => {
    useEditorStore.setState({ sidebarCollapsed: true, activePanel: 'media' });
    state().setActivePanel('media');
    expect(state().sidebarCollapsed).toBe(true);
  });

  it('reveals the inspector when a tab is chosen', () => {
    useEditorStore.setState({ inspectorCollapsed: true });
    state().setInspectorTab('audio');

    expect(state().inspectorCollapsed).toBe(false);
    expect(state().inspectorTab).toBe('audio');
  });

  it('clamps the dragged stage pane width to usable bounds', () => {
    state().setStagePaneWidth(500);
    expect(state().stagePaneWidth).toBe(500);

    state().setStagePaneWidth(10);
    expect(state().stagePaneWidth).toBe(240);

    state().setStagePaneWidth(99_999);
    expect(state().stagePaneWidth).toBe(1280);

    state().setStagePaneWidth(null);
    expect(state().stagePaneWidth).toBeNull();
  });

  it('clamps resizable side panes without recording project edits', () => {
    state().setLibraryPaneWidth(400);
    state().setInspectorPaneWidth(420);
    expect(state().libraryPaneWidth).toBe(400);
    expect(state().inspectorPaneWidth).toBe(420);

    state().setLibraryPaneWidth(10);
    state().setInspectorPaneWidth(99_999);
    expect(state().libraryPaneWidth).toBe(240);
    expect(state().inspectorPaneWidth).toBe(560);
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);

    state().setLibraryPaneWidth(null);
    state().setInspectorPaneWidth(null);
    expect(state().libraryPaneWidth).toBeNull();
    expect(state().inspectorPaneWidth).toBeNull();
  });

  it('clamps timeline height without recording project edits', () => {
    state().setTimelinePaneHeight(480);
    expect(state().timelinePaneHeight).toBe(480);
    state().setTimelinePaneHeight(10);
    expect(state().timelinePaneHeight).toBe(120);
    state().setTimelinePaneHeight(99_999);
    expect(state().timelinePaneHeight).toBe(1200);
    expect(state().editRevision).toBe(0);
    expect(state().isDirty).toBe(false);
    state().setTimelinePaneHeight(null);
    expect(state().timelinePaneHeight).toBeNull();
  });
});

describe('project', () => {
  it('names the first project "Untitled project" and marks it dirty', () => {
    state().newProject({
      id: 'project-a' as ProjectId,
      createdAt: '2026-07-17T10:00:00.000Z',
    });
    expect(state().projectId).toBe('project-a');
    expect(state().projectName).toBe('Untitled project');
    expect(state().projectCreatedAt).toBe('2026-07-17T10:00:00.000Z');
    expect(state().isDirty).toBe(true);
  });

  it('increments the name on repeated clicks so it is visibly not a no-op', () => {
    state().newProject();
    state().newProject();
    state().newProject();
    expect(state().projectName).toBe('Untitled project 3');
  });

  it('starts with an empty project media pool', () => {
    state().addMediaItems([mediaItem('/old-project.mp4')]);
    state().newProject();
    expect(state().mediaItems).toEqual([]);
  });

  it('adds media items to the pool without touching the project', () => {
    const item = mediaItem('/a.mp4');
    state().addMediaItems([item]);

    expect(state().mediaItems).toEqual([item]);
    expect(state().projectName).toBeNull();
    expect(state().isDirty).toBe(true);
  });

  it('does not clear newer edits when an older save finishes', () => {
    state().markDirty();
    const savingRevision = state().editRevision;
    state().markDirty();

    state().markSaved(savingRevision);
    expect(state().isDirty).toBe(true);

    state().markSaved(state().editRevision);
    expect(state().isDirty).toBe(false);
  });

  it('renames the project as a durable edit', () => {
    useEditorStore.setState({ projectName: 'Before' });
    state().renameProject('After');

    expect(state().projectName).toBe('After');
    expect(state().isDirty).toBe(true);
    expect(state().editRevision).toBe(1);
  });

  it('restores persisted project metadata without marking it dirty', () => {
    const item = mediaItem('/restored.mp4');
    state().restoreProject({
      id: 'restored' as ProjectId,
      name: 'Restored project',
      aspectRatio: '16:9',
      mediaItems: [item],
      createdAt: '2026-07-17T09:00:00.000Z',
    });

    expect(state()).toMatchObject({
      projectId: 'restored',
      projectName: 'Restored project',
      aspectRatio: '16:9',
      isDirty: false,
      editRevision: 0,
    });
    expect(state().mediaItems).toEqual([item]);
  });
});
