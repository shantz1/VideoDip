'use client';

import { cn } from '@videodip/ui';
import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { formatCombo } from './shortcut-registry';
import type { Shortcut } from './shortcut.types';
import { shortcutRegistry, useShortcuts } from './use-shortcuts';

/** Searchable, keyboard-accessible view of every registered editor command. */
export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [commands, setCommands] = useState<readonly Shortcut[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    setCommands(shortcutRegistry.list());
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useShortcuts([
    {
      id: 'global.commandPalette',
      label: 'Open command palette',
      description: 'Search all currently available editor commands.',
      scope: 'global',
      combo: { key: 'k', mod: true },
      run: open,
      allowInInput: true,
    },
  ]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.description ?? ''} ${command.scope}`.toLowerCase().includes(term),
    );
  }, [commands, query]);

  if (!isOpen) return null;

  const run = (command: Shortcut) => {
    if (command.disabled) return;
    setIsOpen(false);
    command.run();
  };

  return (
    <div
      className="bg-surface-overlay/70 fixed inset-0 z-[--z-modal] flex items-start justify-center p-8 pt-24"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="border-border-default bg-surface-raised w-full max-w-xl overflow-hidden rounded-lg border shadow-xl"
      >
        <div className="border-border-subtle flex items-center gap-2 border-b px-3 py-2">
          <Search className="text-text-tertiary size-4" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter') {
                const command = filtered[activeIndex];
                if (command) run(command);
              }
            }}
            placeholder="Search commands…"
            aria-label="Search commands"
            aria-controls="command-palette-results"
            className="text-text-primary placeholder:text-text-tertiary min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="border-border-subtle bg-surface-inset text-text-tertiary rounded-sm border px-1.5 py-0.5 text-xs">
            Esc
          </kbd>
        </div>
        <ul
          id="command-palette-results"
          role="listbox"
          aria-label="Commands"
          className="max-h-96 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="text-text-tertiary px-3 py-8 text-center text-sm">No commands found.</li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  disabled={command.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(command)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                    'focus-visible:outline-2 focus-visible:outline-[--color-border-focus]',
                    index === activeIndex ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                    command.disabled && 'opacity-50',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-text-primary block truncate text-sm">
                      {command.label}
                    </span>
                    <span className="text-text-tertiary block text-xs capitalize">
                      {command.scope}
                    </span>
                  </span>
                  <kbd className="border-border-subtle bg-surface-inset text-text-secondary shrink-0 rounded-sm border px-1.5 py-0.5 text-xs">
                    {formatCombo(command.combo)}
                  </kbd>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
