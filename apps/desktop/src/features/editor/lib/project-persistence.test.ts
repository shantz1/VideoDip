import { ms, ok, projectSnapshotSchema, type ProjectRepository } from '@videodip/shared';
import { createTimeline } from '@videodip/timeline';
import { addSubtitleSegment, createSubtitleDocument } from '@videodip/subtitle-engine';
import { describe, expect, it, vi } from 'vitest';
import { loadLatestProject, saveProjectState } from './project-persistence';

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

describe('loadLatestProject', () => {
  it('returns null when storage has no projects', async () => {
    await expect(loadLatestProject(repository())).resolves.toEqual({ ok: true, value: null });
  });

  it('loads the first, newest summary', async () => {
    const load = vi.fn(async () => ok(snapshot));
    const projects = repository({
      list: vi.fn(async () =>
        ok([{ id: snapshot.id, name: snapshot.name, updatedAt: snapshot.updatedAt }]),
      ),
      load,
    });

    await expect(loadLatestProject(projects)).resolves.toEqual({ ok: true, value: snapshot });
    expect(load).toHaveBeenCalledWith(snapshot.id, undefined);
  });
});

describe('saveProjectState', () => {
  it('validates and saves a versioned snapshot', async () => {
    let saved: typeof snapshot | undefined;
    const subtitleResult = addSubtitleSegment(createSubtitleDocument('en'), {
      start: ms(0),
      end: ms(1000),
      text: 'Persist me',
      style: { foreground: '#12ab34' },
    });
    if (!subtitleResult.ok) throw new Error(subtitleResult.error.message);
    const save: Repository['save'] = async (project) => {
      saved = project;
      return ok(undefined);
    };
    const result = await saveProjectState(repository({ save }), {
      id: snapshot.id,
      name: snapshot.name,
      aspectRatio: snapshot.aspectRatio,
      timeline: createTimeline(),
      mediaItems: [],
      subtitles: subtitleResult.value,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    });

    expect(result.ok).toBe(true);
    expect(saved).toMatchObject({ version: 1, id: snapshot.id });
    expect(saved?.subtitles.segments[0]).toMatchObject({
      text: 'Persist me',
      style: { foreground: '#12ab34' },
    });
  });
});
