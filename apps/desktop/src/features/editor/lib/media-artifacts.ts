import { invoke } from '@tauri-apps/api/core';
import {
  generatedMediaArtifactSchema,
  mediaArtifactSchema,
  type GeneratedMediaArtifact,
  type MediaArtifact,
  type MediaArtifactCache,
  type MediaArtifactRequest,
  type MediaArtifactWorker,
} from '@videodip/media-engine';
import { appError, err, ok, type Result } from '@videodip/shared';

/** Minimal injectable IPC boundary used by native media-artifact adapters. */
export type MediaArtifactInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

function cancelled() {
  return appError(
    'CANCELLED',
    'Media artifact generation was cancelled.',
    'Retry the operation when you are ready.',
  );
}

function processFailure(operation: string, cause: unknown) {
  return appError(
    'PROCESS_FAILED',
    `${operation} failed in the desktop media host.`,
    'Check that FFmpeg is installed, then retry with a supported media file.',
    { cause, retryable: true },
  );
}

function cacheFailure(operation: string, cause: unknown) {
  return appError(
    'IO',
    `${operation} failed in the desktop media cache.`,
    'Clear generated media data or restart VideoDip, then retry.',
    { cause, retryable: true },
  );
}

/** Creates the cancellable FFmpeg worker used by the shared artifact service. */
export function createTauriMediaArtifactWorker(
  runInvoke: MediaArtifactInvoke = (command, args) => invoke(command, args),
  createTaskId: () => string = () => crypto.randomUUID(),
): MediaArtifactWorker {
  return {
    async generate(request, context): Promise<Result<GeneratedMediaArtifact>> {
      if (context.signal.aborted) return err(cancelled());
      const taskId = createTaskId();
      const cancel = () => {
        void runInvoke('cancel_media_artifact', { taskId }).catch(() => undefined);
      };
      context.signal.addEventListener('abort', cancel, { once: true });
      try {
        context.onProgress(0.02);
        const value = await runInvoke('generate_media_artifact', {
          taskId,
          request: { source: request.source, options: request.options },
        });
        if (context.signal.aborted) return err(cancelled());
        const parsed = generatedMediaArtifactSchema.safeParse(value);
        if (!parsed.success) {
          return err(processFailure('Media artifact validation', parsed.error));
        }
        context.onProgress(1);
        return ok(parsed.data as GeneratedMediaArtifact);
      } catch (cause) {
        return err(
          context.signal.aborted ? cancelled() : processFailure('Media generation', cause),
        );
      } finally {
        context.signal.removeEventListener('abort', cancel);
      }
    },
  };
}

/** Creates the atomic app-cache adapter used by the shared artifact service. */
export function createTauriMediaArtifactCache(
  runInvoke: MediaArtifactInvoke = (command, args) => invoke(command, args),
): MediaArtifactCache {
  return {
    async get(cacheKey, signal): Promise<Result<MediaArtifact | null>> {
      if (signal.aborted) return err(cancelled());
      try {
        const value = await runInvoke('get_media_artifact_cache', { cacheKey });
        if (signal.aborted) return err(cancelled());
        const parsed = mediaArtifactSchema.nullable().safeParse(value);
        return parsed.success
          ? ok(parsed.data as MediaArtifact | null)
          : err(cacheFailure('Media cache read validation', parsed.error));
      } catch (cause) {
        return err(signal.aborted ? cancelled() : cacheFailure('Media cache read', cause));
      }
    },

    async put(cacheKey, artifact, signal): Promise<Result<MediaArtifact>> {
      if (signal.aborted) return err(cancelled());
      try {
        const value = await runInvoke('put_media_artifact_cache', {
          cacheKey,
          artifact,
        });
        if (signal.aborted) return err(cancelled());
        const parsed = mediaArtifactSchema.safeParse(value);
        return parsed.success
          ? ok(parsed.data as MediaArtifact)
          : err(cacheFailure('Media cache write validation', parsed.error));
      } catch (cause) {
        return err(signal.aborted ? cancelled() : cacheFailure('Media cache write', cause));
      }
    },
  };
}

function unsupported() {
  return appError(
    'UNSUPPORTED',
    'Derived media artifacts need a browser media-storage adapter.',
    'Open this project in the VideoDip desktop app until browser media storage is available.',
  );
}

/** Browser worker placeholder preserving the shared editor contract without native FFmpeg. */
export function createBrowserMediaArtifactWorker(): MediaArtifactWorker {
  return { generate: async () => err(unsupported()) };
}

/** Browser cache placeholder until OPFS-backed media storage is implemented. */
export function createBrowserMediaArtifactCache(): MediaArtifactCache {
  return {
    get: async () => err(unsupported()),
    put: async () => err(unsupported()),
  };
}
