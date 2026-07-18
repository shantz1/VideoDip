import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import {
  appError,
  err,
  normalized,
  ok,
  type AppUpdateInfo,
  type AppUpdatePort,
  type Result,
} from '@videodip/shared';

/** Download lifecycle events emitted by the Tauri updater during staging. */
type DownloadEvent =
  | { readonly event: 'Started'; readonly data: { readonly contentLength?: number } }
  | { readonly event: 'Progress'; readonly data: { readonly chunkLength: number } }
  | { readonly event: 'Finished' };

/** The slice of a discovered Tauri update this adapter consumes. */
interface DiscoveredUpdate {
  readonly version: string;
  readonly body?: string | null;
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>;
}

/** The native surface this adapter needs, injectable so tests run with no Tauri alive. */
export interface TauriUpdaterApi {
  check(): Promise<DiscoveredUpdate | null>;
  relaunch(): Promise<void>;
}

const nativeApi: TauriUpdaterApi = {
  check: async () => (await check()) as DiscoveredUpdate | null,
  relaunch,
};

/**
 * Desktop self-update through the signed Tauri updater feed.
 *
 * A failed `check` resolves `Ok<null>` per the port contract: the feed lives
 * on the network, and an unreachable feed must never degrade the editor or
 * surface as a user-facing problem.
 */
export function createTauriAppUpdatePort(api: TauriUpdaterApi = nativeApi): AppUpdatePort {
  let pending: DiscoveredUpdate | null = null;
  return {
    check: async (): Promise<Result<AppUpdateInfo | null>> => {
      try {
        const update = await api.check();
        if (update === null) return ok(null);
        pending = update;
        return ok({
          version: update.version,
          ...(update.body ? { notes: update.body } : {}),
        });
      } catch {
        return ok(null);
      }
    },
    downloadAndInstall: async (onProgress): Promise<Result<void>> => {
      const update = pending;
      if (update === null) {
        return err(
          appError(
            'CONFLICT',
            'No update has been discovered to download.',
            'Check for updates again, then retry.',
          ),
        );
      }
      try {
        let total = 0;
        let received = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') total = event.data.contentLength ?? 0;
          else if (event.event === 'Progress') {
            received += event.data.chunkLength;
            if (total > 0) onProgress?.(normalized(Math.min(received / total, 1)));
          } else onProgress?.(normalized(1));
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          appError(
            'PROCESS_FAILED',
            'The update could not be downloaded and staged.',
            'Retry from the update notice, or install the newest release manually.',
            { cause, retryable: true },
          ),
        );
      }
    },
    restart: async (): Promise<Result<void>> => {
      try {
        await api.relaunch();
        return ok(undefined);
      } catch (cause) {
        return err(
          appError(
            'PROCESS_FAILED',
            'VideoDip could not restart itself.',
            'Close and reopen VideoDip; the downloaded update applies on launch.',
            { cause, retryable: true },
          ),
        );
      }
    },
  };
}

/** Browsers cannot self-update an installed application; the check is silent. */
export function createBrowserAppUpdatePort(): AppUpdatePort {
  const unsupported = (): Result<never> =>
    err(
      appError(
        'UNSUPPORTED',
        'Self-update needs the desktop application.',
        'Use VideoDip Desktop for installed updates.',
      ),
    );
  return {
    check: async () => ok(null),
    downloadAndInstall: async () => unsupported(),
    restart: async () => unsupported(),
  };
}
