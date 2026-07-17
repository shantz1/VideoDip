import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { appError, tryCatchAsync, type Result } from '@videodip/shared';

/** Injectable fullscreen boundary for desktop and browser implementations. */
export interface FullscreenController {
  readonly isFullscreen: () => Promise<boolean>;
  readonly setFullscreen: (fullscreen: boolean) => Promise<void>;
}

function getFullscreenController(): FullscreenController {
  if (isTauri()) {
    const currentWindow = getCurrentWindow();
    return {
      isFullscreen: () => currentWindow.isFullscreen(),
      setFullscreen: (fullscreen) => currentWindow.setFullscreen(fullscreen),
    };
  }

  return {
    isFullscreen: async () => document.fullscreenElement !== null,
    setFullscreen: async (fullscreen) => {
      if (fullscreen) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    },
  };
}

/** Toggles the native app window (or browser preview) fullscreen state. */
export function toggleFullscreen(
  controller: FullscreenController = getFullscreenController(),
): Promise<Result<boolean>> {
  return tryCatchAsync(
    async () => {
      const next = !(await controller.isFullscreen());
      await controller.setFullscreen(next);
      return next;
    },
    (cause) =>
      appError('IO', 'Could not change fullscreen mode.', 'Try the fullscreen control again.', {
        cause,
      }),
  );
}
