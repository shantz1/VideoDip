import { projectSnapshotSchema, type ProjectId } from '@videodip/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserProjectRepository,
  createTauriProjectRepository,
  type InvokeRunner,
} from './project-repository';

const snapshot = projectSnapshotSchema.parse({
  version: 1,
  id: 'project-a',
  name: 'Project A',
  aspectRatio: '9:16',
  timeline: { tracks: [] },
  mediaItems: [],
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T10:01:00.000Z',
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('Tauri project repository', () => {
  it('uses the command boundary and validates returned data', async () => {
    const invokeMock = vi.fn(async (command: string) => {
      if (command === 'list_projects') {
        return [{ id: snapshot.id, name: snapshot.name, updatedAt: snapshot.updatedAt }];
      }
      if (command === 'load_project') return snapshot;
      return undefined;
    });
    const repository = createTauriProjectRepository(invokeMock as InvokeRunner);

    expect((await repository.list()).ok).toBe(true);
    expect((await repository.load(snapshot.id)).ok).toBe(true);
    expect((await repository.save(snapshot)).ok).toBe(true);
    expect((await repository.delete(snapshot.id)).ok).toBe(true);
    expect(invokeMock.mock.calls).toEqual([
      ['list_projects'],
      ['load_project', { id: snapshot.id }],
      ['save_project', { snapshot }],
      ['delete_project', { id: snapshot.id }],
    ]);
  });

  it('rejects invalid snapshots returned across IPC', async () => {
    const repository = createTauriProjectRepository(async () => ({ version: 99 }) as never);
    const result = await repository.load('broken' as ProjectId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.recovery).toMatch(/another project|retry/i);
    }
  });
});

describe('browser project repository', () => {
  it('round-trips, lists newest first, and deletes snapshots', async () => {
    const repository = createBrowserProjectRepository(memoryStorage());
    const newer = projectSnapshotSchema.parse({
      ...snapshot,
      id: 'project-b',
      name: 'Project B',
      updatedAt: '2026-07-17T10:02:00.000Z',
    });

    expect((await repository.save(snapshot)).ok).toBe(true);
    expect((await repository.save(newer)).ok).toBe(true);
    const listed = await repository.list();
    expect(listed.ok && listed.value.map((project) => project.id)).toEqual([newer.id, snapshot.id]);
    expect(await repository.load(snapshot.id)).toEqual({ ok: true, value: snapshot });

    await repository.delete(snapshot.id);
    const missing = await repository.load(snapshot.id);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND');
  });

  it('reports corrupt browser data as a recoverable failure', async () => {
    const storage = memoryStorage();
    storage.setItem('videodip.projects.v1', '{bad json');
    const result = await createBrowserProjectRepository(storage).list();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.recovery).toMatch(/clear VideoDip site storage/i);
    }
  });

  it('honours an already-aborted operation', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await createBrowserProjectRepository(memoryStorage()).list(controller.signal);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CANCELLED');
  });
});
