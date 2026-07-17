import { invoke } from '@tauri-apps/api/core';
import {
  appError,
  err,
  ok,
  projectSnapshotSchema,
  projectSummarySchema,
  type ProjectRepository,
  type ProjectSnapshot,
  type ProjectSummary,
  type Result,
} from '@videodip/shared';

const BROWSER_PROJECTS_KEY = 'videodip.projects.v1';
const projectListSchema = projectSnapshotSchema.array();
const summaryListSchema = projectSummarySchema.array();

/** Minimal injectable Tauri IPC boundary used by repository tests. */
export type InvokeRunner = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type ProjectStore = ProjectRepository<ProjectSnapshot, ProjectSummary>;

class BoundaryValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BoundaryValidationError';
  }
}

function cancelled(operation: string) {
  return appError(
    'CANCELLED',
    `${operation} was cancelled.`,
    'Try the project operation again when you are ready.',
  );
}

async function atStorageBoundary<T>(
  operation: string,
  recovery: string,
  signal: AbortSignal | undefined,
  run: () => Promise<T> | T,
): Promise<Result<T>> {
  if (signal?.aborted) return err(cancelled(operation));
  try {
    const value = await run();
    if (signal?.aborted) return err(cancelled(operation));
    return ok(value);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const code =
      cause instanceof BoundaryValidationError
        ? 'VALIDATION'
        : message.toLowerCase().includes('not found')
          ? 'NOT_FOUND'
          : 'IO';
    return err(
      appError(code, `${operation} failed: ${message}`, recovery, {
        cause,
        retryable: code === 'IO',
      }),
    );
  }
}

function validatedSnapshot(value: unknown): ProjectSnapshot {
  const parsed = projectSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new BoundaryValidationError(parsed.error.message, { cause: parsed.error });
  }
  return parsed.data;
}

function validatedSummaries(value: unknown): readonly ProjectSummary[] {
  const parsed = summaryListSchema.safeParse(value);
  if (!parsed.success) {
    throw new BoundaryValidationError(parsed.error.message, { cause: parsed.error });
  }
  return parsed.data;
}

/** SQLite-backed project repository exposed through the thin Tauri command layer. */
export function createTauriProjectRepository(
  runInvoke: InvokeRunner = (command, args) => invoke(command, args),
): ProjectStore {
  return {
    async list(signal) {
      return atStorageBoundary(
        'Listing projects',
        'Retry. If this keeps failing, restart VideoDip and check app-data permissions.',
        signal,
        async () => validatedSummaries(await runInvoke<unknown>('list_projects')),
      );
    },

    async load(id, signal) {
      return atStorageBoundary(
        'Loading the project',
        'Choose another project or retry after restarting VideoDip.',
        signal,
        async () => validatedSnapshot(await runInvoke<unknown>('load_project', { id })),
      );
    },

    async save(project, signal) {
      return atStorageBoundary(
        'Saving the project',
        'Keep VideoDip open and retry. Check that the app-data location is writable.',
        signal,
        async () => {
          const snapshot = validatedSnapshot(project);
          await runInvoke<void>('save_project', { snapshot });
        },
      );
    },

    async delete(id, signal) {
      return atStorageBoundary(
        'Deleting the project',
        'Retry the delete operation after restarting VideoDip.',
        signal,
        () => runInvoke<void>('delete_project', { id }),
      );
    },
  };
}

function readBrowserProjects(storage: Storage): ProjectSnapshot[] {
  const serialized = storage.getItem(BROWSER_PROJECTS_KEY);
  if (serialized === null) return [];
  try {
    const parsed = projectListSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success) {
      throw new BoundaryValidationError(parsed.error.message, { cause: parsed.error });
    }
    return parsed.data;
  } catch (cause) {
    if (cause instanceof BoundaryValidationError) throw cause;
    throw new BoundaryValidationError('Saved browser project data is not valid JSON.', { cause });
  }
}

function writeBrowserProjects(storage: Storage, projects: readonly ProjectSnapshot[]): void {
  storage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(projects));
}

/** Browser repository with the same contract and snapshot format as desktop SQLite. */
export function createBrowserProjectRepository(storage: Storage): ProjectStore {
  return {
    async list(signal) {
      return atStorageBoundary(
        'Listing browser projects',
        'Reload the page. If saved data is damaged, clear VideoDip site storage.',
        signal,
        () =>
          readBrowserProjects(storage)
            .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
    },

    async load(id, signal) {
      return atStorageBoundary(
        'Loading the browser project',
        'Choose another project or clear damaged VideoDip site storage.',
        signal,
        () => {
          const project = readBrowserProjects(storage).find((candidate) => candidate.id === id);
          if (!project) throw new Error(`Project ${id} was not found.`);
          return project;
        },
      );
    },

    async save(project, signal) {
      return atStorageBoundary(
        'Saving the browser project',
        'Keep this tab open and make space in browser site storage, then retry.',
        signal,
        () => {
          const snapshot = validatedSnapshot(project);
          const projects = readBrowserProjects(storage).filter(
            (candidate) => candidate.id !== snapshot.id,
          );
          writeBrowserProjects(storage, [...projects, snapshot]);
        },
      );
    },

    async delete(id, signal) {
      return atStorageBoundary(
        'Deleting the browser project',
        'Reload the page and retry the delete operation.',
        signal,
        () => {
          writeBrowserProjects(
            storage,
            readBrowserProjects(storage).filter((candidate) => candidate.id !== id),
          );
        },
      );
    },
  };
}
