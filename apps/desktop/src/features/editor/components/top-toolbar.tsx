'use client';

import type { AssetId } from '@videodip/shared';
import { Button, buttonVariants, cn } from '@videodip/ui';
import { Download, HardDrive, Redo2, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShortcuts, type Shortcut } from '../../shortcuts/index';
import { useEditorStore } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import type { RenderEngineStatus } from '../lib/render-video';
import { useSubtitleStore } from '../subtitle.store';
import { startNewProject as startNewProjectCommand } from '../lib/project-commands';
import { useProjectStore } from '../project.store';
import { useProjectArchiveController } from './project-archive-controller';
import { WorkspaceLayoutSelector } from './workspace-layout-selector';

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
  const archiveController = useProjectArchiveController();
  const { importMedia, projects } = useEditorHost();
  const projectName = useEditorStore((state) => state.projectName);
  const isDirty = useEditorStore((state) => state.isDirty);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const addMediaItems = useEditorStore((state) => state.addMediaItems);
  const toggleSidebar = useEditorStore((state) => state.toggleSidebar);
  const toggleInspector = useEditorStore((state) => state.toggleInspector);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.past.length > 0);
  const canRedo = useProjectStore((state) => state.future.length > 0);
  const [isImporting, setIsImporting] = useState(false);
  const [isChangingProject, setIsChangingProject] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  const startNewProject = () => {
    setCommandError(null);
    setIsChangingProject(true);
    void startNewProjectCommand(projects).then((result) => {
      if (!result.ok) setCommandError(result.error.recovery);
      setIsChangingProject(false);
    });
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
        {
          label: isChangingProject ? 'Creating project…' : 'New project',
          action: startNewProject,
          disabled: isChangingProject,
        },
        {
          label: 'Import .videodip…',
          action: () => void archiveController.importArchive(),
          disabled: archiveController.isBusy,
        },
        {
          label: 'Export portable .videodip…',
          action: () => void archiveController.exportPortable(),
          disabled: archiveController.isBusy || projectName === null,
        },
        {
          label: 'Export linked .videodip…',
          action: () => void archiveController.exportLinked(),
          disabled: archiveController.isBusy || projectName === null,
        },
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

        <WorkspaceLayoutSelector />

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
          className="vd-no-drag bg-danger-subtle text-danger absolute top-full right-3 z-(--z-toast) mt-2 max-w-72 rounded-md px-3 py-2 text-xs shadow-lg"
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

type ExportEngine = 'composited' | 'cuts';

/**
 * The Export action: save dialog → the selected engine with real percentage
 * progress.
 *
 * Two engines, chosen explicitly (ADR-0011): "Full render" burns in
 * subtitles, transitions and effects through the same composition the
 * preview shows; "Fast cut" is the FFmpeg cuts-only path, always available
 * as the fallback. State is local — an export in flight or a failure message
 * is transient UI, not project state, and nothing outside this button needs
 * it. Disabled while the timeline is empty (nothing to export) or an export
 * is already running (both engines contend for the same output file). Ctrl+E
 * goes through the central shortcut registry, never an ad-hoc listener.
 */
function ExportButton() {
  const { exportTimeline, renderTimelineComposited, getRenderEngineStatus } = useEditorHost();
  const documentValue = useProjectStore((state) => state.document);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const exportPresetId = useEditorStore((state) => state.exportPresetId);
  const [phase, setPhase] = useState<ExportPhase>({ kind: 'idle' });
  const [renderStatus, setRenderStatus] = useState<RenderEngineStatus | null>(null);
  const [engine, setEngine] = useState<ExportEngine>('cuts');
  const exportController = useRef<AbortController | null>(null);

  // Probe once on mount; never rejects. Default to the WYSIWYG engine when
  // it is provisioned — but the choice stays visible and reversible.
  useEffect(() => {
    let isMounted = true;
    void getRenderEngineStatus().then((status) => {
      if (!isMounted) return;
      setRenderStatus(status);
      if (status.isAvailable) setEngine('composited');
    });
    return () => {
      isMounted = false;
    };
  }, [getRenderEngineStatus]);

  const hasClips = documentValue.tracks.some(
    (track) => track.kind === 'video' && track.clips.length > 0,
  );
  const isRunning = phase.kind === 'running';
  const isCompositedAvailable = renderStatus?.isAvailable === true;

  const startExport = async () => {
    if (!hasClips || isRunning) return;
    setPhase({ kind: 'running', fraction: 0 });
    const controller = new AbortController();
    exportController.current = controller;

    const mediaByAsset = new Map(mediaItems.map((item) => [item.id, item]));
    const onProgress = (fraction: number) => setPhase({ kind: 'running', fraction });
    const result =
      engine === 'composited' && isCompositedAvailable
        ? await renderTimelineComposited(
            documentValue,
            subtitleDocument,
            (assetId: AssetId) => {
              const item = mediaByAsset.get(assetId);
              return item === undefined
                ? undefined
                : { path: String(item.locator), mediaKind: item.kind };
            },
            aspectRatio,
            onProgress,
            controller.signal,
            exportPresetId,
          )
        : await exportTimeline(
            documentValue,
            (assetId: AssetId) => {
              const item = mediaByAsset.get(assetId);
              return item === undefined ? undefined : String(item.locator);
            },
            aspectRatio,
            onProgress,
            controller.signal,
            exportPresetId,
          );
    if (exportController.current === controller) exportController.current = null;

    if (result.ok) {
      // Path or user-cancelled: either way there is nothing left to show.
      setPhase({ kind: 'idle' });
    } else {
      setPhase({ kind: 'error', message: result.error.recovery });
    }
  };

  const cancelExport = () => exportController.current?.abort();

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
      {
        id: 'project.export.cancel',
        label: 'Cancel video export',
        scope: 'project',
        combo: { key: 'Escape' },
        disabled: !isRunning,
        run: cancelExport,
      },
    ],
    // Only the disabled flag needs to re-register: the registry reads the
    // latest handler through a ref, so startExport's identity is irrelevant.
    [hasClips, isRunning],
  );
  useShortcuts(shortcuts);

  const engineOptions: readonly {
    readonly id: ExportEngine;
    readonly label: string;
    readonly title: string;
    readonly isDisabled: boolean;
  }[] = [
    {
      id: 'composited',
      label: 'Full',
      title: isCompositedAvailable
        ? 'Full render: subtitles, transitions and effects burned in — exactly what the preview shows.'
        : (renderStatus?.reason ?? 'Checking the composited render runtime…'),
      isDisabled: !isCompositedAvailable || isRunning,
    },
    {
      id: 'cuts',
      label: 'Fast',
      title:
        'Fast cut: FFmpeg joins the trimmed clips directly. Quickest, but subtitles and effects are not burned in.',
      isDisabled: isRunning,
    },
  ];

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <div
          role="radiogroup"
          aria-label="Export engine"
          className="bg-surface-sunken flex items-center gap-0.5 rounded-md p-0.5"
        >
          {engineOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={engine === option.id}
              disabled={option.isDisabled}
              title={option.title}
              onClick={() => setEngine(option.id)}
              className={cn(
                'rounded-sm px-2 py-1 text-xs transition-colors duration-(--duration-fast)',
                'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
                engine === option.id
                  ? 'bg-surface-raised text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary',
                'disabled:text-text-disabled disabled:pointer-events-none',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
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
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<X />}
            title="Cancel export (Escape)"
            onClick={cancelExport}
          >
            Cancel
          </Button>
        )}
      </div>
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
            className="bg-accent block h-full transition-[width] duration-(--duration-fast)"
            style={{ width: `${phase.fraction * 100}%` }}
          />
        </span>
      )}
      {phase.kind === 'error' && (
        <div
          role="alert"
          className={cn(
            'absolute top-full right-0 z-(--z-dropdown) mt-2 w-72 rounded-md p-2',
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
    <details
      className="group relative"
      // Menus are mutually exclusive: opening one closes its siblings —
      // without this, every <details> stays open independently and the bar
      // ends up with all six dropdowns overlapping.
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        const container = event.currentTarget.parentElement;
        if (container === null) return;
        for (const sibling of container.querySelectorAll('details[open]')) {
          if (sibling !== event.currentTarget) sibling.removeAttribute('open');
        }
      }}
      // Clicking or tabbing anywhere outside closes the menu, matching how
      // every native menubar behaves.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.removeAttribute('open');
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.currentTarget.removeAttribute('open');
        event.currentTarget.querySelector('summary')?.focus();
      }}
    >
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
          'absolute top-full left-0 z-(--z-dropdown) mt-1 min-w-40 rounded-md p-1',
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
              'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
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
