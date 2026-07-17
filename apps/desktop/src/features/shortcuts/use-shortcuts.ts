'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ShortcutRegistry } from './shortcut-registry';
import type { Shortcut } from './shortcut.types';

/**
 * The app-wide registry instance.
 *
 * A module singleton rather than context, deliberately: shortcuts are a
 * property of the running application, there is exactly one keyboard, and
 * threading a provider through every panel buys nothing. Tests construct their
 * own {@link ShortcutRegistry} instead of touching this.
 */
export const shortcutRegistry = new ShortcutRegistry();

/**
 * Registers shortcuts for the lifetime of a component and dispatches key events.
 *
 * Mount the listener once, at the app root, by passing `attachListener`.
 * Everywhere else, just register.
 *
 * Handlers are read through a ref so that a shortcut closing over changing
 * state does not force re-registration on every render — otherwise every
 * keystroke that updates state would tear down and rebuild the whole map.
 *
 * @example
 * ```tsx
 * useShortcuts([
 *   { id: 'playback.toggle', label: 'Play/Pause', scope: 'playback',
 *     combo: { key: ' ' }, run: togglePlay },
 * ]);
 * ```
 */
export function useShortcuts(shortcuts: readonly Shortcut[], attachListener = false): void {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  // Register by id, and re-register only when the *shape* changes — not when a
  // handler's closure changes, which is every render.
  const signature = useMemo(
    () => shortcuts.map((s) => `${s.id}:${s.disabled ? '0' : '1'}`).join('|'),
    [shortcuts],
  );

  useEffect(() => {
    const disposers = latest.current.map((shortcut, index) =>
      shortcutRegistry.register({
        ...shortcut,
        // Indirect through the ref so the handler is always current.
        run: () => latest.current[index]?.run(),
      }),
    );
    return () => disposers.forEach((dispose) => dispose());
  }, [signature]);

  useEffect(() => {
    if (!attachListener) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const fired = shortcutRegistry.dispatch(event);
      if (fired) {
        // Only prevent default when a shortcut actually ran. Blanket
        // preventDefault would break browser and OS keys the app has no
        // opinion about.
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attachListener]);
}
