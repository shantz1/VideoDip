import { describe, expect, it, vi } from 'vitest';
import { ShortcutRegistry, comboKey, formatCombo, matchesCombo } from './shortcut-registry';
import type { Shortcut } from './shortcut.types';

function keyEvent(init: Partial<KeyboardEventInit> & { key: string }, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', init);
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

const shortcut = (overrides: Partial<Shortcut> & Pick<Shortcut, 'id' | 'combo'>): Shortcut => ({
  label: overrides.id,
  scope: 'global',
  run: () => {},
  ...overrides,
});

describe('matchesCombo', () => {
  it('maps mod to Meta on macOS', () => {
    expect(matchesCombo(keyEvent({ key: 's', metaKey: true }), { key: 's', mod: true }, true)).toBe(
      true,
    );
    expect(matchesCombo(keyEvent({ key: 's', ctrlKey: true }), { key: 's', mod: true }, true)).toBe(
      false,
    );
  });

  it('maps mod to Ctrl off macOS', () => {
    expect(matchesCombo(keyEvent({ key: 's', ctrlKey: true }), { key: 's', mod: true }, false)).toBe(
      true,
    );
    expect(matchesCombo(keyEvent({ key: 's', metaKey: true }), { key: 's', mod: true }, false)).toBe(
      false,
    );
  });

  it('does not fire mod+s when shift is also held', () => {
    // The silent-conflict case: without checking unrequested modifiers,
    // mod+s would shadow a separate mod+shift+s "Save As".
    expect(
      matchesCombo(
        keyEvent({ key: 's', ctrlKey: true, shiftKey: true }),
        { key: 's', mod: true },
        false,
      ),
    ).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    expect(matchesCombo(keyEvent({ key: 'S' }), { key: 's' }, false)).toBe(true);
  });
});

describe('formatCombo', () => {
  it('concatenates glyphs with no separator on macOS', () => {
    expect(formatCombo({ key: 's', mod: true }, true)).toBe('⌘S');
    expect(formatCombo({ key: 'z', mod: true, shift: true }, true)).toBe('⇧⌘Z');
  });

  it('joins words with + off macOS', () => {
    expect(formatCombo({ key: 's', mod: true }, false)).toBe('Ctrl+S');
    expect(formatCombo({ key: 'z', mod: true, shift: true }, false)).toBe('Ctrl+Shift+Z');
  });

  it('renders symbols for named keys', () => {
    expect(formatCombo({ key: ' ' }, false)).toBe('Space');
    expect(formatCombo({ key: 'arrowleft' }, false)).toBe('←');
  });
});

describe('comboKey', () => {
  it('produces the same key regardless of modifier declaration order', () => {
    expect(comboKey({ key: 's', mod: true, shift: true })).toBe(
      comboKey({ shift: true, mod: true, key: 'S' }),
    );
  });
});

describe('ShortcutRegistry', () => {
  it('runs a matching shortcut and reports which one ran', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register(shortcut({ id: 'project.save', combo: { key: 's', mod: true }, run }));

    const fired = registry.dispatch(keyEvent({ key: 's', ctrlKey: true }), false);

    expect(run).toHaveBeenCalledOnce();
    expect(fired?.id).toBe('project.save');
  });

  it('returns undefined when nothing matches', () => {
    const registry = new ShortcutRegistry();
    expect(registry.dispatch(keyEvent({ key: 'q' }), false)).toBeUndefined();
  });

  it('skips disabled shortcuts', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register(shortcut({ id: 'x', combo: { key: 'x' }, run, disabled: true }));

    registry.dispatch(keyEvent({ key: 'x' }), false);
    expect(run).not.toHaveBeenCalled();
  });

  describe('typing targets', () => {
    it('does not fire a single-key shortcut while typing in an input', () => {
      const registry = new ShortcutRegistry();
      const run = vi.fn();
      registry.register(shortcut({ id: 'timeline.split', combo: { key: 's' }, run }));

      const input = document.createElement('input');
      registry.dispatch(keyEvent({ key: 's' }, input), false);

      // Typing "s" into a subtitle must not split the clip.
      expect(run).not.toHaveBeenCalled();
    });

    it('fires in an input when the shortcut opts in', () => {
      const registry = new ShortcutRegistry();
      const run = vi.fn();
      registry.register(
        shortcut({ id: 'project.save', combo: { key: 's', mod: true }, run, allowInInput: true }),
      );

      const input = document.createElement('input');
      registry.dispatch(keyEvent({ key: 's', ctrlKey: true }, input), false);
      expect(run).toHaveBeenCalledOnce();
    });

    it('treats contenteditable as a typing target', () => {
      const registry = new ShortcutRegistry();
      const run = vi.fn();
      registry.register(shortcut({ id: 'x', combo: { key: 'x' }, run }));

      const div = document.createElement('div');
      div.contentEditable = 'true';
      // jsdom does not derive isContentEditable from the attribute.
      Object.defineProperty(div, 'isContentEditable', { value: true });

      registry.dispatch(keyEvent({ key: 'x' }, div), false);
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('conflicts', () => {
    it('detects two shortcuts bound to the same combo in the same scope', () => {
      const registry = new ShortcutRegistry();
      registry.register(shortcut({ id: 'a', combo: { key: 's', mod: true }, scope: 'timeline' }));

      const conflict = registry.findConflict(
        shortcut({ id: 'b', combo: { key: 's', mod: true }, scope: 'timeline' }),
      );
      expect(conflict?.id).toBe('a');
    });

    it('allows the same combo in different scopes', () => {
      // Space means different things in different panels; that is legitimate.
      const registry = new ShortcutRegistry();
      registry.register(shortcut({ id: 'a', combo: { key: ' ' }, scope: 'timeline' }));

      expect(
        registry.findConflict(shortcut({ id: 'b', combo: { key: ' ' }, scope: 'subtitle' })),
      ).toBeUndefined();
    });

    it('treats a global shortcut as conflicting with every scope', () => {
      const registry = new ShortcutRegistry();
      registry.register(shortcut({ id: 'a', combo: { key: 'k', mod: true }, scope: 'global' }));

      expect(
        registry.findConflict(shortcut({ id: 'b', combo: { key: 'k', mod: true }, scope: 'timeline' })),
      ).toBeDefined();
    });
  });

  describe('disposal', () => {
    it('unregisters on dispose', () => {
      const registry = new ShortcutRegistry();
      const run = vi.fn();
      const dispose = registry.register(shortcut({ id: 'x', combo: { key: 'x' }, run }));

      dispose();
      registry.dispatch(keyEvent({ key: 'x' }), false);

      expect(run).not.toHaveBeenCalled();
      expect(registry.list()).toHaveLength(0);
    });

    it('a stale disposer does not remove a newer registration of the same id', () => {
      // Hot reload re-registers before the old effect cleans up. Without the
      // identity guard, the live binding would be silently deleted.
      const registry = new ShortcutRegistry();
      const staleDispose = registry.register(shortcut({ id: 'x', combo: { key: 'x' } }));

      const fresh = vi.fn();
      registry.register(shortcut({ id: 'x', combo: { key: 'x' }, run: fresh }));
      staleDispose();

      registry.dispatch(keyEvent({ key: 'x' }), false);
      expect(fresh).toHaveBeenCalledOnce();
    });
  });
});
