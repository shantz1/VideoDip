/**
 * Keyboard shortcut contract.
 *
 * `CLAUDE.md`: "Every major action has a keyboard shortcut, registered through
 * the central registry — never an ad-hoc addEventListener."
 *
 * The registry exists because scattered listeners cannot answer the questions
 * that matter: what is bound right now, does this conflict with an existing
 * binding, and what should the command palette list? Those are unanswerable
 * once handlers are spread across components, which is how editors end up with
 * silent conflicts.
 */

/**
 * A platform-independent shortcut description.
 *
 * `mod` is the important one: it resolves to Cmd on macOS and Ctrl elsewhere.
 * Binding Ctrl directly is a bug on macOS, where Ctrl is a distinct key with
 * its own system meaning.
 */
export interface KeyCombo {
  /** `KeyboardEvent.key`, lowercased. e.g. `'s'`, `'delete'`, `' '` for space. */
  readonly key: string;
  /** Cmd on macOS, Ctrl elsewhere. Use this, not `ctrl`. */
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /** Literal Ctrl on every platform. Rare — you almost always want `mod`. */
  readonly ctrl?: boolean;
}

/** Groups shortcuts in the command palette and the shortcuts dialog. */
export type ShortcutScope =
  | 'global'
  | 'playback'
  | 'timeline'
  | 'editing'
  | 'view'
  | 'project'
  | 'subtitle';

/** A registered command. */
export interface Shortcut {
  /** Stable identifier, e.g. `'timeline.split'`. Used for overrides later. */
  readonly id: string;
  /** Human-readable name. Shown in the command palette. */
  readonly label: string;
  /** Longer explanation for the shortcuts dialog. */
  readonly description?: string;
  readonly scope: ShortcutScope;
  readonly combo: KeyCombo;
  readonly run: () => void;
  /**
   * When true, the shortcut is registered but inert. Prefer this over
   * unregistering: a shortcut that vanishes from the palette when unavailable
   * is more confusing than one shown as disabled.
   */
  readonly disabled?: boolean;
  /**
   * Allow firing while a text input has focus.
   *
   * Defaults to false, which is almost always right: the user typing "s" into
   * a subtitle should not split the clip. Only destructive-free global
   * commands (like Save) should opt in.
   */
  readonly allowInInput?: boolean;
}
