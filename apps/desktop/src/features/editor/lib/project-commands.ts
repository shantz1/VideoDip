import type { MediaItem } from '@videodip/media-engine';
import type { SubtitleDocument } from '@videodip/subtitle-engine';
import {
  appError,
  err,
  ok,
  type ProjectArchivePort,
  type ProjectArchiveReceipt,
  type ProjectId,
  type ProjectRepository,
  type ProjectSnapshot,
  type ProjectSummary,
  type Result,
} from '@videodip/shared';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';
import { saveProjectState } from './project-persistence';

type ProjectStore = ProjectRepository<ProjectSnapshot, ProjectSummary>;

/** Applies a validated persisted snapshot to both stores as one application command. */
export function restoreProjectSnapshot(snapshot: ProjectSnapshot): void {
  useEditorStore.getState().restoreProject({
    ...snapshot,
    // Runtime validation has already removed explicit undefined values. This
    // closes Zod's exactOptionalPropertyTypes inference gap at one boundary.
    mediaItems: snapshot.mediaItems as readonly MediaItem[],
  });
  useProjectStore.getState().load(snapshot.timeline);
  useSubtitleStore.getState().load(snapshot.subtitles as SubtitleDocument);
}

/** Flushes current dirty state before a command replaces the active project. */
export async function saveCurrentProject(
  projects: ProjectStore,
  updatedAt = new Date().toISOString(),
): Promise<Result<void>> {
  const editor = useEditorStore.getState();
  if (!editor.isDirty) return ok(undefined);
  if (
    editor.projectId === null ||
    editor.projectName === null ||
    editor.projectCreatedAt === null
  ) {
    return err(
      appError(
        'VALIDATION',
        'The current project has edits but no durable identity.',
        'Create a new project, then retry this action.',
      ),
    );
  }

  const revision = editor.editRevision;
  const saved = await saveProjectState(projects, {
    id: editor.projectId,
    name: editor.projectName,
    aspectRatio: editor.aspectRatio,
    timeline: useProjectStore.getState().document,
    mediaItems: editor.mediaItems,
    subtitles: useSubtitleStore.getState().document,
    createdAt: editor.projectCreatedAt,
    updatedAt,
  });
  if (saved.ok) useEditorStore.getState().markSaved(revision);
  return saved;
}

/** Starts a fresh project only after the current one has been flushed. */
export async function startNewProject(projects: ProjectStore): Promise<Result<void>> {
  const saved = await saveCurrentProject(projects);
  if (!saved.ok) return saved;
  useEditorStore.getState().newProject();
  useProjectStore.getState().reset();
  useSubtitleStore.getState().reset();
  return ok(undefined);
}

/** Saves the current project, loads the requested snapshot, then swaps stores. */
export async function openSavedProject(
  projects: ProjectStore,
  id: ProjectId,
): Promise<Result<void>> {
  if (useEditorStore.getState().projectId === id) return ok(undefined);
  const saved = await saveCurrentProject(projects);
  if (!saved.ok) return saved;
  const loaded = await projects.load(id);
  if (!loaded.ok) return loaded;
  restoreProjectSnapshot(loaded.value);
  return ok(undefined);
}

/**
 * Deletes a saved project.
 *
 * Deleting the active snapshot is intentionally non-destructive until the
 * repository confirms the delete. Only then do all three in-memory project
 * stores move to a fresh blank project, preventing autosave from recreating
 * the deleted identity and preventing a failed delete from discarding work.
 */
export async function deleteSavedProject(
  projects: ProjectStore,
  id: ProjectId,
): Promise<Result<void>> {
  const wasActive = useEditorStore.getState().projectId === id;
  const deleted = await projects.delete(id);
  if (!deleted.ok || !wasActive) return deleted;

  useEditorStore.getState().newProject();
  useProjectStore.getState().reset();
  useSubtitleStore.getState().reset();
  return deleted;
}

/** Renames active or inactive snapshots through the same validated repository. */
export async function renameSavedProject(
  projects: ProjectStore,
  id: ProjectId,
  requestedName: string,
  updatedAt = new Date().toISOString(),
): Promise<Result<void>> {
  const name = requestedName.trim();
  if (name.length === 0 || name.length > 160) {
    return err(
      appError(
        'VALIDATION',
        'Project names must contain between 1 and 160 characters.',
        'Enter a shorter non-empty project name.',
      ),
    );
  }

  if (useEditorStore.getState().projectId === id) {
    useEditorStore.getState().renameProject(name);
    return saveCurrentProject(projects, updatedAt);
  }

  const loaded = await projects.load(id);
  if (!loaded.ok) return loaded;
  return projects.save({ ...loaded.value, name, updatedAt });
}

/** Flushes and exports the active project through the selected host archive port. */
export async function exportCurrentProjectArchive(
  projects: ProjectStore,
  archives: ProjectArchivePort<ProjectSnapshot>,
  includeMedia: boolean,
): Promise<Result<ProjectArchiveReceipt | null>> {
  const saved = await saveCurrentProject(projects);
  if (!saved.ok) return saved;
  const projectId = useEditorStore.getState().projectId;
  if (projectId === null) {
    return err(
      appError(
        'VALIDATION',
        'There is no active project to export.',
        'Create or open a project, then export it.',
      ),
    );
  }
  const project = await projects.load(projectId);
  if (!project.ok) return project;
  return archives.exportArchive(project.value, { includeMedia });
}

/** Flushes current work, imports and persists an archive, then activates it. */
export async function importProjectArchive(
  projects: ProjectStore,
  archives: ProjectArchivePort<ProjectSnapshot>,
  updatedAt = new Date().toISOString(),
): Promise<Result<ProjectSnapshot | null>> {
  const saved = await saveCurrentProject(projects);
  if (!saved.ok) return saved;
  const imported = await archives.importArchive();
  if (!imported.ok || imported.value === null) return imported;
  const project = { ...imported.value, updatedAt };
  const persisted = await projects.save(project);
  if (!persisted.ok) return persisted;
  restoreProjectSnapshot(project);
  return ok(project);
}
