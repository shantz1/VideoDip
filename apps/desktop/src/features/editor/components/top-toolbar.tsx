'use client';

import { Button, cn } from '@videodip/ui';
import {
  ChevronDown,
  Download,
  Redo2,
  Sparkles,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEditorStore } from '../editor.store';

/** Top-level menus, per the product brief. */
const MENUS = ['Project', 'Edit', 'View', 'Templates', 'Plugins', 'Help'] as const;

/**
 * The application toolbar.
 *
 * Doubles as the Tauri window drag region (`vd-drag-region`), which is why
 * interactive children opt out with `vd-no-drag` — without it, clicking a
 * button would drag the window instead of activating it.
 *
 * PLACEHOLDER: menus are not wired to anything. They render and open nothing
 * until the command system exists. The shortcuts registry is the intended
 * backing store for their contents.
 */
export function TopToolbar() {
  const projectName = useEditorStore((s) => s.projectName);
  const isDirty = useEditorStore((s) => s.isDirty);

  return (
    <header
      className={cn(
        'vd-drag-region flex h-11 shrink-0 items-center gap-1 px-3',
        'border-b border-border-subtle bg-surface-raised',
      )}
    >
      <Logo />

      <nav className="vd-no-drag ml-2 flex items-center gap-0.5" aria-label="Main menu">
        {MENUS.map((menu) => (
          <Button key={menu} variant="ghost" size="sm" className="font-normal">
            {menu}
          </Button>
        ))}
      </nav>

      {/* Centre: project identity. Absolutely positioned so it stays centred
          regardless of how wide the menus and actions grow. */}
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <span className="text-xs text-text-secondary">
          {projectName ?? 'Untitled project'}
        </span>
        {isDirty && (
          <span
            className="size-1.5 rounded-full bg-warning"
            role="status"
            aria-label="Unsaved changes"
          />
        )}
      </div>

      <div className="vd-no-drag ml-auto flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Undo" leadingIcon={<Undo2 />} />
        <Button size="icon-sm" variant="ghost" aria-label="Redo" leadingIcon={<Redo2 />} />

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <Button size="sm" variant="ghost" leadingIcon={<Sparkles />}>
          AI
        </Button>
        <Button size="sm" variant="primary" leadingIcon={<Download />}>
          Export
        </Button>

        <div className="mx-1 h-4 w-px bg-border-subtle" />

        <UserMenu />
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="vd-no-drag flex items-center gap-2 pl-1">
      <div
        className={cn(
          'grid size-5 place-items-center rounded-sm',
          'bg-accent text-text-on-brand',
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-3">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight">VideoDip</span>
    </div>
  );
}

/** PLACEHOLDER: no account system exists. VideoDip requires no login (ADR-0002). */
function UserMenu() {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 pl-1" aria-label="Account">
      <span
        className="grid size-5 place-items-center rounded-full bg-surface-inset text-2xs font-medium"
        aria-hidden="true"
      >
        S
      </span>
      <ChevronDown className="size-3 text-text-tertiary" aria-hidden="true" />
    </Button>
  );
}

export type { LucideIcon };
