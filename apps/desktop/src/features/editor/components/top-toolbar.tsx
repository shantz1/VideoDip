'use client';

import type { AssetId } from '@videodip/shared';
import { Button, buttonVariants, cn } from '@videodip/ui';
import { Download, HardDrive, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShortcuts, type Shortcut } from '../../shortcuts/index';
import { useEditorStore } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import { useProjectStore } from '../project.store';

interface MenuItem {
  readonly label: string;
  readonly action?: () => void;
  readonly disabled?: boolean;
}

interface MenuDefinition {
  readonly label: string;
  readonly items: readonly MenuItem[];
}

/** The application toolbar, command menus, and primary editor actions. */
export function TopToolbar() {
  const { importMedia } = useEditorHost();
  const projectName = useEditorStore((state) => state.projectName);
  const isDirty = useEditorStore((state) => state.isDirty);
  const newProject = useEditorStore((state) => state.newProject);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const addMediaItems = useEditorStore((state) => state.addMediaItems);
  const toggleSidebar = useEditorStore((state) => state.toggleSidebar);
  const toggleInspector = useEditorStore((state) => state.toggleInspector);
  const resetProject = useProjectStore((state) => state.reset);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.past.length > 0);
  const canRedo = useProjectStore((state) => state.future.length > 0);
  const [isImporting, setIsImporting] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  const startNewProject = () => {
    newProject();
    resetProject();
  };

  const handleImport = () => {
    setActivePanel('media');
    setCommandError(null);
    setIsImporting(true);
    void importMedia().then((result) => {
      if (result.ok) addMediaItems(result.value);
      else setCommandError(result.error.recovery);
      setIsImporting(false);
    });
  };

  const menus: readonly MenuDefinition[] = [
    {
      label: 'Project',
      items: [
        { label: 'New project', action: startNewProject },
        {
          label: isImporting ? 'Importing media…' : 'Import media…',
          action: handleImport,
          disabled: isImporting,
        },
        { label: 'Browse projects', action: () => setActivePanel('projects') },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', action: undo, disabled: !canUndo },
        { label: 'Redo', action: redo, disabled: !canRedo },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle media sidebar', action: toggleSidebar },
        { label: 'Toggle inspector', action: toggleInspector },
        { label: 'Open settings', action: () => setActivePanel('settings') },
      ],
    },
    {
      label: 'Templates',
      items: [{ label: 'Browse templates', action: () => setActivePanel('templates') }],
    },
    {
      label: 'Plugins',
      items: [{ label: 'Manage plugins', action: () => setActivePanel('plugins') }],
    },
    {
      label: 'Help',
      items: [{ label: 'VideoDip 0.1.0', disabled: true }],
    },
  ];

  return (
    <header
      className={cn(
        'vd-drag-region relative flex h-11 shrink-0 items-center gap-1 px-3',
        'border-border-subtle bg-surface-raised border-b',
      )}
    >
      <Logo />

      <nav className="vd-no-drag ml-2 flex items-center gap-0.5" aria-label="Main menu">
        {menus.map((menu) => (
          <ToolbarMenu key={menu.label} menu={menu} />
        ))}
      </nav>

      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <span className="text-text-secondary text-xs">{projectName ?? 'Untitled project'}</span>
        {isDirty && (
          <span
            className="bg-warning size-1.5 rounded-full"
            role="status"
            aria-label="Unsaved changes"
          />
        )}
      </div>

      <div className="vd-no-drag ml-auto flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
          leadingIcon={<Undo2 />}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
          leadingIcon={<Redo2 />}
        />

        <div className="bg-border-subtle mx-1 h-4 w-px" />

        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Sparkles />}
          onClick={() => setActivePanel('ai')}
        >
          AI
        </Button>
        <ExportButton />

        <div className="bg-border-subtle mx-1 h-4 w-px" />

        <div
          className="text-text-tertiary flex items-center gap-1.5 px-1 text-xs"
          title="Projects and media stay on this machine"
        >
          <HardDrive className="size-3.5" aria-hidden="true" />
          <span>Local</span>
        </div>
      </div>
      {commandError && (
        <p
          role="alert"
          className="vd-no-drag bg-danger-subtle text-danger absolute top-full right-3 z-[--z-toast] mt-2 max-w-72 rounded-md px-3 py-2 text-xs shadow-lg"
        >
          {commandError}
        </p>
      )}
    </header>
  );
}

type ExportPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly fraction: number }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The Export action: save dialog → FFmpeg with real percentage progress.
 *
 * State is local — an export in flight or a failure message is transient UI,
 * not project state, and nothing outside this button needs it. Disabled while
 * the timeline is empty (nothing to export) or an export is already running
 * (FFmpeg contends for the same output file). Ctrl+E goes through the
 * central shortcut registry, never an ad-hoc listener.
 */
function ExportButton() {
  const { exportTimeline } = useEditorHost();
  const documentValue = useProjectStore((state) => state.document);
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const [phase, setPhase] = useState<ExportPhase>({ kind: 'idle' });

  const hasClips = documentValue.tracks.some(
    (track) => track.kind === 'video' && track.clips.length > 0,
  );
  const isRunning = phase.kind === 'running';

  const startExport = async () => {
    if (!hasClips || isRunning) return;
    setPhase({ kind: 'running', fraction: 0 });

    const pathByAsset = new Map(mediaItems.map((item) => [item.id, String(item.locator)]));
    const result = await exportTimeline(
      documentValue,
      (assetId: AssetId) => pathByAsset.get(assetId),
      aspectRatio,
      (fraction) => setPhase({ kind: 'running', fraction }),
    );

    if (result.ok) {
      // Path or user-cancelled: either way there is nothing left to show.
      setPhase({ kind: 'idle' });
    } else {
      setPhase({ kind: 'error', message: result.error.recovery });
    }
  };

  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      {
        id: 'project.export',
        label: 'Export video',
        scope: 'project',
        combo: { key: 'e', mod: true },
        disabled: !hasClips || isRunning,
        run: () => void startExport(),
      },
    ],
    // Only the disabled flag needs to re-register: the registry reads the
    // latest handler through a ref, so startExport's identity is irrelevant.
    [hasClips, isRunning],
  );
  useShortcuts(shortcuts);

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="primary"
        leadingIcon={<Download />}
        disabled={!hasClips || isRunning}
        title={hasClips ? 'Export video (Ctrl+E)' : 'Add clips to the timeline to export.'}
        onClick={() => void startExport()}
      >
        {isRunning ? `Exporting ${Math.round(phase.fraction * 100)}%` : 'Export'}
      </Button>
      {isRunning && (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(phase.fraction * 100)}
          aria-label="Export progress"
          className="bg-surface-sunken absolute inset-x-0 -bottom-0.5 h-0.5 overflow-hidden rounded-full"
        >
          <span
            className="bg-accent block h-full transition-[width] duration-[--duration-fast]"
            style={{ width: `${phase.fraction * 100}%` }}
          />
        </span>
      )}
      {phase.kind === 'error' && (
        <div
          role="alert"
          className={cn(
            'absolute top-full right-0 z-[--z-dropdown] mt-2 w-72 rounded-md p-2',
            'border-border-default bg-surface-overlay border shadow-lg',
          )}
        >
          <p className="text-danger text-xs whitespace-pre-wrap">{phase.message}</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            onClick={() => setPhase({ kind: 'idle' })}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

function ToolbarMenu({ menu }: { menu: MenuDefinition }) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'cursor-pointer list-none font-normal [&::-webkit-details-marker]:hidden',
        )}
      >
        {menu.label}
      </summary>
      <div
        role="menu"
        className={cn(
          'absolute top-full left-0 z-[--z-dropdown] mt-1 min-w-40 rounded-md p-1',
          'border-border-default bg-surface-overlay border shadow-lg',
        )}
      >
        {menu.items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => {
              item.action?.();
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            className={cn(
              'text-text-secondary flex w-full rounded-sm px-2 py-1.5 text-left text-xs',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-2 focus-visible:outline-[--color-border-focus]',
              'disabled:text-text-disabled disabled:pointer-events-none',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function Logo() {
  return (
    <div className="vd-no-drag flex items-center gap-2 pl-1">
      <div
        className="bg-accent text-text-on-brand grid size-5 place-items-center rounded-sm"
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
