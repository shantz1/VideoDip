import type { KeyCombo, Shortcut } from './shortcut.types';

/**
 * True when running on macOS.
 *
 * Uses `navigator.platform` with a `userAgent` fallback. Deliberately not
 * checking Tauri's OS API: this must work identically in the browser dev
 * server and inside the desktop shell, and the answer only affects which
 * modifier we read.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent;
  return /mac|iphone|ipad/i.test(platform);
}

/**
 * Whether a keyboard event matches a combo.
 *
 * Every modifier is checked, including the ones the combo does not ask for.
 * Without that, `mod+s` would also fire on `mod+shift+s` and shadow a distinct
 * "Save As" binding — the classic silent conflict.
 */
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo, mac = isMac()): boolean {
  if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false;

  const modPressed = mac ? event.metaKey : event.ctrlKey;
  if (Boolean(combo.mod) !== modPressed) return false;
  if (Boolean(combo.shift) !== event.shiftKey) return false;
  if (Boolean(combo.alt) !== event.altKey) return false;

  // On macOS `mod` maps to Meta, leaving Ctrl free to be its own modifier.
  // Elsewhere `mod` IS Ctrl, so checking ctrl separately would double-count.
  if (mac && Boolean(combo.ctrl) !== event.ctrlKey) return false;

  return true;
}

/** Stable string key for a combo, used to detect conflicts. */
export function comboKey(combo: KeyCombo): string {
  return [
    combo.mod ? 'mod' : '',
    combo.ctrl ? 'ctrl' : '',
    combo.shift ? 'shift' : '',
    combo.alt ? 'alt' : '',
    combo.key.toLowerCase(),
  ]
    .filter(Boolean)
    .join('+');
}

/** Symbols for rendering a combo. Mac uses glyphs; other platforms use words. */
const KEY_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  enter: '↵',
  backspace: '⌫',
  delete: 'Del',
  escape: 'Esc',
};

/**
 * Formats a combo for display, e.g. `⌘S` on macOS or `Ctrl+S` elsewhere.
 *
 * Platform convention matters here: macOS concatenates glyphs with no
 * separator, Windows and Linux join words with `+`. Getting this wrong is a
 * small thing that immediately reads as non-native.
 */
export function formatCombo(combo: KeyCombo, mac = isMac()): string {
  const key = KEY_LABELS[combo.key.toLowerCase()] ?? combo.key.toUpperCase();
  const parts: string[] = [];

  if (mac) {
    if (combo.ctrl) parts.push('⌃');
    if (combo.alt) parts.push('⌥');
    if (combo.shift) parts.push('⇧');
    if (combo.mod) parts.push('⌘');
    return [...parts, key].join('');
  }

  if (combo.mod || combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  return [...parts, key].join('+');
}

/**
 * Whether the event originated from somewhere the user is typing.
 *
 * Covers `contenteditable` as well as inputs, because the subtitle editor will
 * use it and a bare tag check would let single-key shortcuts fire mid-word.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The central shortcut registry.
 *
 * Framework-free by design — no React import — so it is unit-testable without
 * a DOM and could later be driven by Tauri's native menu. React binds to it
 * through `useShortcuts`.
 *
 * Registration is last-wins with a dev-time warning rather than an error: a
 * hot reload legitimately re-registers the same id, and throwing would make
 * development miserable for no safety gain.
 */
export class ShortcutRegistry {
  readonly #shortcuts = new Map<string, Shortcut>();

  /**
   * Registers a shortcut.
   *
   * @returns A disposer. Call it on unmount, or the handler outlives the
   *   component that owns it and fires against stale state.
   */
  register(shortcut: Shortcut): () => void {
    if (this.#shortcuts.has(shortcut.id) && process.env.NODE_ENV !== 'production') {
      console.warn(`[shortcuts] Re-registering "${shortcut.id}". Previous binding replaced.`);
    }

    const conflict = this.findConflict(shortcut);
    if (conflict && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[shortcuts] "${shortcut.id}" (${comboKey(shortcut.combo)}) conflicts with ` +
          `"${conflict.id}". The later registration wins; the earlier is now dead.`,
      );
    }

    this.#shortcuts.set(shortcut.id, shortcut);
    return () => {
      // Guard against a stale disposer removing a newer registration of the
      // same id, which hot reload makes easy to hit.
      if (this.#shortcuts.get(shortcut.id) === shortcut) {
        this.#shortcuts.delete(shortcut.id);
      }
    };
  }

  /** An existing shortcut bound to the same combo in the same scope, if any. */
  findConflict(candidate: Shortcut): Shortcut | undefined {
    const key = comboKey(candidate.combo);
    for (const existing of this.#shortcuts.values()) {
      if (existing.id === candidate.id) continue;
      if (comboKey(existing.combo) !== key) continue;
      // Global shortcuts conflict with everything; scoped ones only with their
      // own scope, so `Space` can mean different things in different panels.
      if (
        existing.scope === candidate.scope ||
        existing.scope === 'global' ||
        candidate.scope === 'global'
      ) {
        return existing;
      }
    }
    return undefined;
  }

  /** All registered shortcuts. Feeds the command palette. */
  list(): readonly Shortcut[] {
    return [...this.#shortcuts.values()];
  }

  /**
   * Dispatches an event to the first matching shortcut.
   *
   * @returns The shortcut that ran, or `undefined`. Callers use this to decide
   *   whether to `preventDefault`.
   */
  dispatch(event: KeyboardEvent, mac = isMac()): Shortcut | undefined {
    const typing = isTypingTarget(event.target);

    for (const shortcut of this.#shortcuts.values()) {
      if (shortcut.disabled) continue;
      if (typing && !shortcut.allowInInput) continue;
      if (!matchesCombo(event, shortcut.combo, mac)) continue;

      shortcut.run();
      return shortcut;
    }
    return undefined;
  }

  /** Removes everything. Tests only. */
  clear(): void {
    this.#shortcuts.clear();
  }
}
