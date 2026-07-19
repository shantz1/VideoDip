import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ms, ok, projectSnapshotSchema } from '@videodip/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { EditorHostProvider, type EditorHost } from '../host/editor-host';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';
import { ProjectsPanel } from './left-sidebar';
import { ProjectArchiveControllerProvider } from './project-archive-controller';

const snapshot = projectSnapshotSchema.parse({
  version: 1,
  id: 'saved-project',
  name: 'Saved project',
  aspectRatio: '9:16',
  timeline: { tracks: [] },
  mediaItems: [],
  subtitles: { version: 1, language: 'und', defaultStyle: {}, segments: [] },
  createdAt: '2026-07-19T08:00:00.000Z',
  updatedAt: '2026-07-19T09:00:00.000Z',
});

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSubtitle = useSubtitleStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSubtitleStore.setState(initialSubtitle, true);
});

describe('ProjectsPanel', () => {
  it('deletes the open saved project after explicit confirmation', async () => {
    let deleted = false;
    const deleteProject = vi.fn(async () => {
      deleted = true;
      return ok(undefined);
    });
    const host = createHost({
      list: vi.fn(async () =>
        ok(
          deleted ? [] : [{ id: snapshot.id, name: snapshot.name, updatedAt: snapshot.updatedAt }],
        ),
      ),
      delete: deleteProject,
    });
    useEditorStore.getState().restoreProject({
      id: snapshot.id,
      name: snapshot.name,
      aspectRatio: snapshot.aspectRatio,
      mediaItems: [],
      createdAt: snapshot.createdAt,
    });

    render(
      <EditorHostProvider host={host}>
        <ProjectArchiveControllerProvider>
          <ProjectsPanel />
        </ProjectArchiveControllerProvider>
      </EditorHostProvider>,
    );

    const deleteButton = await screen.findByRole('button', { name: `Delete ${snapshot.name}` });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole('button', { name: `Confirm delete ${snapshot.name}` }));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith(snapshot.id));
    expect(await screen.findByText('No saved projects yet.')).toBeVisible();
    expect(useEditorStore.getState().projectId).not.toBe(snapshot.id);
  });
});

function createHost(projects: Partial<EditorHost['projects']>): EditorHost {
  return {
    importMedia: vi.fn(async () => ok([])),
    exportTimeline: vi.fn(async () => ok(null)),
    renderTimelineComposited: vi.fn(async () => ok(null)),
    getRenderEngineStatus: vi.fn(async () => ({
      isAvailable: false,
      nodePath: null,
      cliPath: null,
      reason: 'Unavailable in tests.',
    })),
    toggleFullscreen: vi.fn(async () => ok(true)),
    projects: {
      list: vi.fn(async () => ok([])),
      load: vi.fn(async () => ok(snapshot)),
      save: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
      ...projects,
    },
    projectArchives: {
      exportArchive: vi.fn(async () => ok(null)),
      importArchive: vi.fn(async () => ok(null)),
    },
    transcription: {
      id: 'fake',
      name: 'Fake transcription',
      capabilities: vi.fn(async () =>
        ok({
          wordTimestamps: true,
          diarization: false,
          offline: true,
          gpuAccelerated: false,
          languages: 'auto' as const,
        }),
      ),
      availability: vi.fn(async () => ok({ state: 'ready' as const })),
      transcribe: vi.fn(async () => ok({ language: 'en', durationMs: ms(0), segments: [] })),
    },
    transcriptionModels: {
      status: vi.fn(async () => ok({ runtimeAvailable: true, models: [] })),
      download: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
      select: vi.fn(),
      selected: vi.fn(() => 'small-q5_1'),
    },
    getMediaArtifact: vi.fn(),
    resolveMediaSource: (locator) => `resolved:${locator}`,
    appUpdates: {
      check: vi.fn(async () => ok(null)),
      downloadAndInstall: vi.fn(async () => ok(undefined)),
      restart: vi.fn(async () => ok(undefined)),
    },
  };
}
