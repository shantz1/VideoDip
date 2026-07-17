import { projectSnapshotSchema } from '@videodip/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserProjectArchivePort,
  createTauriProjectArchivePort,
  type ArchiveInvoke,
  type ProjectArchiveDialogs,
} from './project-archive';

const snapshot = projectSnapshotSchema.parse({
  version: 1,
  id: 'project-a',
  name: 'Launch / cut',
  aspectRatio: '9:16',
  timeline: { tracks: [] },
  mediaItems: [],
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T10:01:00.000Z',
});

function dialogs(overrides: Partial<ProjectArchiveDialogs> = {}): ProjectArchiveDialogs {
  return {
    chooseExport: vi.fn(async () => 'C:\\Exports\\launch'),
    chooseImport: vi.fn(async () => 'C:\\Exports\\launch.videodip'),
    ...overrides,
  };
}

describe('Tauri project archive adapter', () => {
  it('exports a validated self-contained project with a normalized extension', async () => {
    const invokeMock = vi.fn(async (_command: string, args?: Record<string, unknown>) =>
      String(args?.destination),
    );
    const archiveDialogs = dialogs();
    const result = await createTauriProjectArchivePort(
      invokeMock as ArchiveInvoke,
      archiveDialogs,
    ).exportArchive(snapshot, { includeMedia: true });

    expect(result).toEqual({
      ok: true,
      value: {
        outputName: 'launch.videodip',
        locator: 'C:\\Exports\\launch.videodip',
        includesMedia: true,
      },
    });
    expect(archiveDialogs.chooseExport).toHaveBeenCalledWith('Launch _ cut.videodip');
    expect(invokeMock).toHaveBeenCalledWith('export_project_archive', {
      snapshot,
      destination: 'C:\\Exports\\launch.videodip',
      includeMedia: true,
    });
  });

  it('imports only snapshots that pass the shared schema', async () => {
    const validInvoke = vi.fn(async () => snapshot);
    const valid = createTauriProjectArchivePort(validInvoke as ArchiveInvoke, dialogs());
    await expect(valid.importArchive()).resolves.toEqual({ ok: true, value: snapshot });
    expect(validInvoke.mock.calls).toEqual([
      ['inspect_project_archive', { source: 'C:\\Exports\\launch.videodip' }],
      [
        'import_project_archive',
        { source: 'C:\\Exports\\launch.videodip', expectedSnapshot: snapshot },
      ],
    ]);

    const invalidInvoke = vi.fn(async () => ({ version: 99 }));
    const invalid = createTauriProjectArchivePort(invalidInvoke as ArchiveInvoke, dialogs());
    const result = await invalid.importArchive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(invalidInvoke).toHaveBeenCalledOnce();
  });

  it('treats a closed dialog as successful cancellation', async () => {
    const invokeMock = vi.fn();
    const port = createTauriProjectArchivePort(
      invokeMock as ArchiveInvoke,
      dialogs({ chooseExport: async () => null, chooseImport: async () => null }),
    );

    await expect(port.exportArchive(snapshot, { includeMedia: false })).resolves.toEqual({
      ok: true,
      value: null,
    });
    await expect(port.importArchive()).resolves.toEqual({ ok: true, value: null });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('browser project archive adapter', () => {
  it('reports the native filesystem requirement without throwing', async () => {
    const result = await createBrowserProjectArchivePort().importArchive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED');
  });
});
