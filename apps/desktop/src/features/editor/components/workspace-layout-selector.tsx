'use client';

import { buttonVariants, cn } from '@videodip/ui';
import {
  Check,
  ChevronDown,
  LayoutDashboard,
  Monitor,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import type { Shortcut } from '../../shortcuts/shortcut.types';
import { useShortcuts } from '../../shortcuts/use-shortcuts';
import { useEditorStore, type WorkspaceLayout } from '../editor.store';

interface WorkspacePreset {
  readonly id: WorkspaceLayout;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const SHORT_VIDEO_WORKSPACE: WorkspacePreset = {
  id: 'short-video',
  label: 'Short video',
  description: 'Full-height portrait preview on the right, tools on the left',
  icon: Smartphone,
};

const WORKSPACE_PRESETS: readonly WorkspacePreset[] = [
  {
    id: 'video',
    label: 'Video editing',
    description: 'Center preview with a full-width timeline',
    icon: Monitor,
  },
  SHORT_VIDEO_WORKSPACE,
];

/** Switches complete editor panel arrangements, not merely the canvas shape. */
export function WorkspaceLayoutSelector() {
  const workspaceLayout = useEditorStore((state) => state.workspaceLayout);
  const setWorkspaceLayout = useEditorStore((state) => state.setWorkspaceLayout);
  const active =
    WORKSPACE_PRESETS.find((preset) => preset.id === workspaceLayout) ?? SHORT_VIDEO_WORKSPACE;
  const ActiveIcon = active.icon;

  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      {
        id: 'view.toggleWorkspaceLayout',
        label: 'Toggle video / short-video workspace',
        scope: 'view',
        combo: { key: 'l', mod: true, shift: true },
        run: () => setWorkspaceLayout(workspaceLayout === 'video' ? 'short-video' : 'video'),
      },
    ],
    [setWorkspaceLayout, workspaceLayout],
  );
  useShortcuts(shortcuts);

  return (
    <details className="group relative">
      <summary
        aria-label={`Workspace layout: ${active.label}`}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'cursor-pointer list-none gap-1 font-normal [&::-webkit-details-marker]:hidden',
        )}
      >
        <LayoutDashboard className="size-3.5" aria-hidden />
        <span className="hidden xl:inline">{active.label}</span>
        <ChevronDown
          className="size-3 transition-transform duration-(--duration-fast) group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div
        role="menu"
        aria-label="Workspace layouts"
        className="border-border-default bg-surface-overlay absolute top-full right-0 z-(--z-dropdown) mt-1 w-72 rounded-md border p-1 shadow-lg"
      >
        <p className="text-text-tertiary px-2 py-1.5 text-xs">Editor workspace</p>
        {WORKSPACE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = preset.id === workspaceLayout;
          return (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              onClick={(event) => {
                setWorkspaceLayout(preset.id);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className={cn(
                'hover:bg-surface-hover grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-sm px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
                isActive ? 'bg-surface-selected' : '',
              )}
            >
              <Icon className="text-text-secondary size-4" aria-hidden />
              <span>
                <span className="text-text-primary block text-xs font-medium">{preset.label}</span>
                <span className="text-text-tertiary block text-[0.625rem]">
                  {preset.description}
                </span>
              </span>
              {isActive && <Check className="text-accent size-3.5" aria-hidden />}
            </button>
          );
        })}
        <p className="text-text-tertiary border-border-subtle border-t px-2 py-1.5 text-[0.625rem]">
          Ctrl+Shift+L toggles both arrangements.
        </p>
      </div>
    </details>
  );
}
