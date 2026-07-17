import {
  ok,
  projectSnapshotSchema,
  type ProjectArchivePort,
  type ProjectId,
  type ProjectRepository,
} from '@videodip/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import {
  deleteSavedProject,
  exportCurrentProjectArchive,
  importProjectArchive,
  openSavedProject,
  renameSavedProject,
  saveCurrentProject,
  startNewProject,
} from './project-commands';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const snapshot = projectSnapshotSchema.parse({
  version: 1,
  id: 'saved-project',
  name: 'Saved project',
  aspectRatio: '16:9',
  timeline: { tracks: [] },
  mediaItems: [],
  createdAt: '2026-07-17T09:00:00.000Z',
  updatedAt: '2026-07-17T10:00:00.000Z',
});

type Repository = ProjectRepository<
  typeof snapshot,
  { id: typeof snapshot.id; name: string; updatedAt: string }
>;

function repository(overrides: Partial<Repository> = {}): Repository {
  return {
    list: vi.fn(async () => ok([])),
    load: vi.fn(async () => ok(snapshot)),
    save: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
    ...overrides,
  };
}

function archives(
  overrides: Partial<ProjectArchivePort<typeof snapshot>> = {},
): ProjectArchivePort<typeof snapshot> {
  return {
    exportArchive: vi.fn(async () => ok(null)),
    importArchive: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
});

describe('project commands', () => {
  it('does not write a clean current project', async () => {
    const save = vi.fn(async () => ok(undefined));
    expect((await saveCurrentProject(repository({ save }))).ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('flushes dirty state before starting a new project', async () => {
    useEditorStore.getState().newProject({
      id: 'current-project' as ProjectId,
      createdAt: '2026-07-17T08:00:00.000Z',
    });
    const save = vi.fn(async () => ok(undefined));

    const result = await startNewProject(repository({ save }));

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().projectId).not.toBe('current-project');
  });

  it('flushes the current project before restoring another one', async () => {
    useEditorStore.getState().newProject({
      id: 'current-project' as ProjectId,
      createdAt: '2026-07-17T08:00:00.000Z',
    });
    const calls: string[] = [];
    const projects = repository({
      save: async () => {
        calls.push('save');
        return ok(undefined);
      },
      load: async () => {
        calls.push('load');
        return ok(snapshot);
      },
    });

    expect((await openSavedProject(projects, snapshot.id)).ok).toBe(true);
    expect(calls).toEqual(['save', 'load']);
    expect(useEditorStore.getState()).toMatchObject({
      projectId: snapshot.id,
      projectName: snapshot.name,
      isDirty: false,
    });
  });

  it('refuses to delete the active project', async () => {
    useEditorStore.setState({ projectId: snapshot.id });
    const remove = vi.fn(async () => ok(undefined));
    const result = await deleteSavedProject(repository({ delete: remove }), snapshot.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    expect(remove).not.toHaveBeenCalled();
  });

  it('renames an inactive project through load and validated save', async () => {
    let savedName: string | undefined;
    const projects = repository({
      save: async (project) => {
        savedName = project.name;
        return ok(undefined);
      },
    });

    const result = await renameSavedProject(projects, snapshot.id, '  New name  ');

    expect(result.ok).toBe(true);
    expect(savedName).toBe('New name');
  });

  it('rejects an empty project name without touching storage', async () => {
    const load = vi.fn(async () => ok(snapshot));
    const result = await renameSavedProject(repository({ load }), snapshot.id, '   ');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(load).not.toHaveBeenCalled();
  });

  it('flushes and loads the active snapshot before archive export', async () => {
    useEditorStore.getState().newProject({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
    });
    const calls: string[] = [];
    const projectStore = repository({
      save: async () => {
        calls.push('save');
        return ok(undefined);
      },
      load: async () => {
        calls.push('load');
        return ok(snapshot);
      },
    });
    const archiveStore = archives({
      exportArchive: async (_project, options) => {
        calls.push(`archive:${options.includeMedia}`);
        return ok(null);
      },
    });

    expect((await exportCurrentProjectArchive(projectStore, archiveStore, true)).ok).toBe(true);
    expect(calls).toEqual(['save', 'load', 'archive:true']);
  });

  it('persists and activates an imported archive snapshot', async () => {
    let persistedName: string | undefined;
    const result = await importProjectArchive(
      repository({
        save: async (project) => {
          persistedName = project.name;
          return ok(undefined);
        },
      }),
      archives({ importArchive: async () => ok(snapshot) }),
      '2026-07-17T11:00:00.000Z',
    );

    expect(result.ok).toBe(true);
    expect(persistedName).toBe(snapshot.name);
    expect(useEditorStore.getState()).toMatchObject({
      projectId: snapshot.id,
      projectName: snapshot.name,
      isDirty: false,
    });
  });
});
