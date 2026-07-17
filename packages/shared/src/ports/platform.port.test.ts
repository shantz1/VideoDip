import { describe, expect, it } from 'vitest';
import { appError, err, ok } from '../result/result.js';
import type { MediaLocator, ProjectId } from '../branded/branded.js';
import type {
  ImportedMediaReference,
  MediaImportPort,
  ProjectArchivePort,
  ProjectRepository,
} from './platform.port.js';

interface TestProject {
  readonly id: ProjectId;
  readonly name: string;
}

class MemoryProjectRepository implements ProjectRepository<TestProject, TestProject> {
  readonly #projects = new Map<ProjectId, TestProject>();

  async list() {
    return ok([...this.#projects.values()]);
  }

  async load(id: ProjectId) {
    const project = this.#projects.get(id);
    return project
      ? ok(project)
      : err(appError('NOT_FOUND', 'Missing test project.', 'Save the project first.'));
  }

  async save(project: TestProject) {
    this.#projects.set(project.id, project);
    return ok(undefined);
  }

  async delete(id: ProjectId) {
    this.#projects.delete(id);
    return ok(undefined);
  }
}

describe('platform ports', () => {
  it('lets the same project workflow run against a host-neutral repository', async () => {
    const repository: ProjectRepository<TestProject, TestProject> = new MemoryProjectRepository();
    const project = { id: 'project-a' as ProjectId, name: 'Launch cut' };

    expect((await repository.save(project)).ok).toBe(true);
    const listed = await repository.list();
    expect(listed.ok && listed.value).toEqual([project]);
    const loaded = await repository.load(project.id);
    expect(loaded.ok && loaded.value).toEqual(project);
  });

  it('represents desktop paths and browser keys through the same media contract', async () => {
    const references: readonly ImportedMediaReference[] = [
      {
        locator: 'C:\\media\\clip.mp4' as MediaLocator,
        name: 'clip.mp4',
        kind: 'video',
      },
      {
        locator: 'opfs://media/clip.mp4' as MediaLocator,
        name: 'clip.mp4',
        kind: 'video',
      },
    ];
    const port: MediaImportPort = { pickMedia: async () => ok(references) };

    const result = await port.pickMedia({ kinds: ['video'], multiple: true });
    expect(result.ok && result.value.map((item) => item.locator)).toEqual([
      'C:\\media\\clip.mp4',
      'opfs://media/clip.mp4',
    ]);
  });

  it('models archive cancellation as a successful null result', async () => {
    const archives: ProjectArchivePort<TestProject> = {
      exportArchive: async () => ok(null),
      importArchive: async () => ok(null),
    };

    await expect(archives.importArchive()).resolves.toEqual(ok(null));
    await expect(
      archives.exportArchive(
        { id: 'project-a' as ProjectId, name: 'Test' },
        { includeMedia: true },
      ),
    ).resolves.toEqual(ok(null));
  });
});
