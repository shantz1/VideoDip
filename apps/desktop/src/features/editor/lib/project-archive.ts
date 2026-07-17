import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  appError,
  err,
  mediaLocatorSchema,
  ok,
  projectSnapshotSchema,
  type ProjectArchivePort,
  type ProjectSnapshot,
  type Result,
} from '@videodip/shared';

const ARCHIVE_EXTENSION = '.videodip';

/** Injectable dialog boundary for archive adapter tests. */
export interface ProjectArchiveDialogs {
  readonly chooseExport: (defaultName: string) => Promise<string | null>;
  readonly chooseImport: () => Promise<string | null>;
}

/** Minimal injectable IPC function for archive adapter tests. */
export type ArchiveInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function defaultDialogs(): ProjectArchiveDialogs {
  return {
    chooseExport: (defaultName) =>
      save({
        defaultPath: defaultName,
        filters: [{ name: 'VideoDip project', extensions: ['videodip'] }],
      }),
    chooseImport: async () => {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'VideoDip project', extensions: ['videodip'] }],
      });
      return Array.isArray(selected) ? (selected[0] ?? null) : selected;
    },
  };
}

function cancelled(operation: string) {
  return appError(
    'CANCELLED',
    `${operation} was cancelled.`,
    'Try the archive operation again when you are ready.',
  );
}

async function atArchiveBoundary<T>(
  operation: string,
  recovery: string,
  signal: AbortSignal | undefined,
  run: () => Promise<Result<T>>,
): Promise<Result<T>> {
  if (signal?.aborted) return err(cancelled(operation));
  try {
    const result = await run();
    if (signal?.aborted) return err(cancelled(operation));
    return result;
  } catch (cause) {
    return err(
      appError('IO', `${operation} failed.`, recovery, {
        cause,
        retryable: true,
      }),
    );
  }
}

function archiveFileName(projectName: string): string {
  const safeName = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, 120);
  return `${safeName || 'VideoDip project'}${ARCHIVE_EXTENSION}`;
}

function ensureArchiveExtension(path: string): string {
  return path.toLowerCase().endsWith(ARCHIVE_EXTENSION) ? path : `${path}${ARCHIVE_EXTENSION}`;
}

function outputName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

/** Desktop ZIP archive adapter backed by Tauri dialogs and Rust streaming I/O. */
export function createTauriProjectArchivePort(
  runInvoke: ArchiveInvoke = (command, args) => invoke(command, args),
  dialogs: ProjectArchiveDialogs = defaultDialogs(),
): ProjectArchivePort<ProjectSnapshot> {
  return {
    async exportArchive(project, options, signal) {
      const parsed = projectSnapshotSchema.safeParse(project);
      if (!parsed.success) {
        return err(
          appError(
            'VALIDATION',
            `Cannot archive an invalid project: ${parsed.error.message}`,
            'Repair the project or remove missing timeline media, then retry.',
            { cause: parsed.error },
          ),
        );
      }
      return atArchiveBoundary(
        'Exporting the VideoDip project archive',
        options.includeMedia
          ? 'Relink missing source media or export a linked archive, then retry.'
          : 'Choose another writable destination and retry.',
        signal,
        async () => {
          const selected = await dialogs.chooseExport(archiveFileName(parsed.data.name));
          if (selected === null) return ok(null);
          const destination = ensureArchiveExtension(selected);
          const rawLocator = await runInvoke<unknown>('export_project_archive', {
            snapshot: parsed.data,
            destination,
            includeMedia: options.includeMedia,
          });
          const locator = mediaLocatorSchema.safeParse(rawLocator);
          if (!locator.success) {
            return err(
              appError(
                'VALIDATION',
                'The archive writer returned an invalid output path.',
                'Retry the export and choose a normal local file path.',
                { cause: locator.error },
              ),
            );
          }
          return ok({
            outputName: outputName(locator.data),
            locator: locator.data,
            includesMedia: options.includeMedia,
          });
        },
      );
    },

    async importArchive(signal) {
      return atArchiveBoundary(
        'Importing the VideoDip project archive',
        'Choose a valid .videodip archive or export it again from VideoDip.',
        signal,
        async () => {
          const source = await dialogs.chooseImport();
          if (source === null) return ok(null);
          const inspected = await runInvoke<unknown>('inspect_project_archive', { source });
          const project = projectSnapshotSchema.safeParse(inspected);
          if (!project.success) {
            return err(
              appError(
                'VALIDATION',
                `The imported project snapshot is invalid: ${project.error.message}`,
                'Choose another archive or export this project again from VideoDip.',
                { cause: project.error },
              ),
            );
          }
          const imported = await runInvoke<unknown>('import_project_archive', {
            source,
            expectedSnapshot: project.data,
          });
          const extractedProject = projectSnapshotSchema.safeParse(imported);
          if (!extractedProject.success) {
            return err(
              appError(
                'VALIDATION',
                `The extracted project snapshot is invalid: ${extractedProject.error.message}`,
                'Remove this imported project and choose the archive again.',
                { cause: extractedProject.error },
              ),
            );
          }
          return ok(extractedProject.data);
        },
      );
    },
  };
}

function unsupportedArchiveError() {
  return appError(
    'UNSUPPORTED',
    'Portable project archives need native filesystem access.',
    'Open this project in the VideoDip desktop app to import or export .videodip files.',
  );
}

/** Browser placeholder preserving one UI contract until OPFS media import exists. */
export function createBrowserProjectArchivePort(): ProjectArchivePort<ProjectSnapshot> {
  return {
    exportArchive: async () => err(unsupportedArchiveError()),
    importArchive: async () => err(unsupportedArchiveError()),
  };
}
