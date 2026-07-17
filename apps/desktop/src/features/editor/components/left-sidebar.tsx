'use client';

import { ms, type TrackId } from '@videodip/shared';
import { findFreeStart } from '@videodip/timeline';
import { Button, cn, useTheme, type ThemeMode } from '@videodip/ui';
import {
  FolderOpen,
  Image,
  LayoutTemplate,
  Music,
  Package,
  Plus,
  Settings,
  Sparkles,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useEditorStore, type AspectRatio, type SidebarPanel } from '../editor.store';
import { importMedia } from '../lib/import-media';
import { useProjectStore } from '../project.store';
import { EmptyState } from './empty-state';

/**
 * Fallback only for containers the platform decoder cannot inspect yet.
 *
 * `media-engine` doesn't probe real media duration yet — see `MediaItem`'s
 * own doc. Every clip gets this length until it does; trimming already works
 * for shortening one down in the meantime.
 */
const UNKNOWN_CLIP_DURATION = ms(5000);

interface PanelDef {
  readonly id: SidebarPanel;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Left rail sections, per the product brief. */
const PANELS: readonly PanelDef[] = [
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'media', label: 'Media', icon: Video },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'assets', label: 'Assets', icon: Image },
  { id: 'fonts', label: 'Fonts', icon: Type },
  { id: 'plugins', label: 'Plugins', icon: Package },
  { id: 'settings', label: 'Settings', icon: Settings },
];

/**
 * The left navigation rail plus its active panel.
 *
 * The rail is always visible; only the panel body collapses. A rail that
 * disappears entirely leaves the user with nothing to click to get it back.
 */
export function LeftSidebar() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const collapsed = useEditorStore((s) => s.sidebarCollapsed);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  const active = PANELS.find((p) => p.id === activePanel);

  return (
    <div className="flex shrink-0">
      <nav
        className={cn(
          'flex w-12 flex-col items-center gap-0.5 py-2',
          'border-r border-border-subtle bg-surface-base',
        )}
        aria-label="Sections"
      >
        {PANELS.map((panel) => (
          <RailButton
            key={panel.id}
            panel={panel}
            active={panel.id === activePanel && !collapsed}
            onClick={() => setActivePanel(panel.id)}
          />
        ))}
      </nav>

      {!collapsed && (
        <aside
          className={cn('flex w-60 flex-col border-r border-border-subtle bg-surface-base')}
          aria-label={active?.label}
        >
          <div className="flex h-9 shrink-0 items-center px-3">
            <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">
              {active?.label}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <PanelBody panel={activePanel} />
          </div>
        </aside>
      )}
    </div>
  );
}

function RailButton({
  panel,
  active,
  onClick,
}: {
  panel: PanelDef;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = panel.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-current, not aria-selected: these are navigation items, not tabs.
      aria-current={active ? 'true' : undefined}
      title={panel.label}
      className={cn(
        'group relative grid size-9 place-items-center rounded-md',
        'transition-colors duration-[--duration-fast]',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        'focus-visible:outline-[--color-border-focus]',
        active
          ? 'bg-surface-selected text-accent'
          : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
      )}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
      <span className="sr-only">{panel.label}</span>
      {active && (
        <span className="absolute left-0 h-4 w-0.5 rounded-r-full bg-accent" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * PLACEHOLDER bodies.
 *
 * Every panel renders a designed empty state rather than nothing, per
 * `CLAUDE.md`. Each is replaced by its real module: Media by media-engine,
 * Templates by template-engine, and so on.
 */
function PanelBody({ panel }: { panel: SidebarPanel }) {
  switch (panel) {
    case 'media':
      return <MediaPanel />;
    case 'projects':
      return <ProjectsPanel />;
    case 'templates':
      return (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates"
          description="Subtitle styles, transitions and effects will appear here."
        />
      );
    case 'ai':
      return (
        <EmptyState
          icon={Sparkles}
          title="AI tools"
          description="Transcription, silence removal and auto-captions run locally on your machine."
        />
      );
    case 'assets':
      return (
        <EmptyState icon={Image} title="No assets" description="Images, overlays and B-roll." />
      );
    case 'fonts':
      return (
        <EmptyState
          icon={Type}
          title="Fonts"
          description="Bundled and system fonts for captions."
        />
      );
    case 'plugins':
      return (
        <EmptyState
          icon={Package}
          title="No plugins installed"
          description="Everything in VideoDip is extensible — templates, effects, AI providers and export presets."
        />
      );
    case 'settings':
      return <SettingsPanel />;
  }
}

const THEME_OPTIONS: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
  { mode: 'system', label: 'System' },
];

/**
 * The Settings panel's real behaviour: a theme switcher.
 *
 * The theme engine itself (`packages/ui/theme/theme-provider.tsx`) has been
 * complete since it was built — dark/light/system, persistence, OS sync,
 * flash-prevention — but nothing in the app ever called `setMode`. This is
 * that missing control, not new theme logic.
 */
function SettingsPanel() {
  const { mode, setMode } = useTheme();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-text-secondary">Appearance</p>
      <div role="radiogroup" aria-label="Theme" className="flex gap-1">
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.mode}
            role="radio"
            aria-checked={mode === option.mode}
            variant={mode === option.mode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode(option.mode)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <p className="mt-3 text-xs font-medium text-text-secondary">Aspect ratio</p>
      <AspectRatioSelector />
    </div>
  );
}

const ASPECT_RATIOS: readonly AspectRatio[] = ['9:16', '3:4', '4:5', '16:9'];

function AspectRatioSelector() {
  const aspectRatio = useEditorStore((s) => s.aspectRatio);
  const setAspectRatio = useEditorStore((s) => s.setAspectRatio);

  return (
    <div role="radiogroup" aria-label="Aspect ratio" className="flex flex-wrap gap-1">
      {ASPECT_RATIOS.map((ratio) => (
        <Button
          key={ratio}
          role="radio"
          aria-checked={aspectRatio === ratio}
          variant={aspectRatio === ratio ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setAspectRatio(ratio)}
        >
          {ratio}
        </Button>
      ))}
    </div>
  );
}

/**
 * The Projects panel's real behaviour: starts a new in-memory project.
 *
 * No project list yet — this panel stays the empty state even after creating
 * one, since there is nowhere else for a "current project" to live. Resets
 * `project.store.ts`'s document too — a "new" project starting with the
 * previous one's clips would be a bug, not a feature. The visible effect is
 * the toolbar's project name, the unsaved-changes indicator, and the
 * timeline clearing.
 */
function ProjectsPanel() {
  const newProject = useEditorStore((s) => s.newProject);
  const resetProject = useProjectStore((s) => s.reset);

  const handleNewProject = () => {
    newProject();
    resetProject();
  };

  return (
    <EmptyState
      icon={FolderOpen}
      title="No projects"
      description="Your projects are saved locally as .videodip archives."
      action="New project"
      onAction={handleNewProject}
    />
  );
}

/**
 * The Media panel's real behaviour: opens the native file picker, lists what
 * has been imported, and places a clip on the video track at the playhead.
 * Path + name only — no thumbnails or duration until `media-engine` gains
 * real probing, which is also why every added clip is the same placeholder
 * length.
 */
function MediaPanel() {
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const addMediaItems = useEditorStore((s) => s.addMediaItems);
  const playhead = useEditorStore((s) => s.playhead);
  const timelineDocument = useProjectStore((s) => s.document);
  const addClip = useProjectStore((s) => s.addClip);
  const [importError, setImportError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = () => {
    setImportError(null);
    setIsImporting(true);
    void importMedia().then((result) => {
      if (result.ok) {
        if (result.value.length > 0) addMediaItems(result.value);
      } else {
        setImportError(result.error.recovery);
      }
      setIsImporting(false);
    });
  };

  const handleAddToTimeline = (item: (typeof mediaItems)[number]) => {
    setTimelineError(null);
    const trackId = item.kind as TrackId;
    const duration = item.duration ?? UNKNOWN_CLIP_DURATION;
    // Place at the playhead when that spot is free, otherwise in the first
    // gap after it — "add" should place the clip, not lecture the user about
    // where their playhead is.
    const start = findFreeStart(timelineDocument, trackId, playhead, duration);
    if (!start.ok) {
      setTimelineError(start.error.recovery);
      return;
    }
    const result = addClip({
      trackId,
      assetId: item.id,
      start: start.value,
      duration,
    });
    if (!result.ok) setTimelineError(result.error.recovery);
  };

  if (mediaItems.length === 0) {
    return (
      <>
        <EmptyState
          icon={Video}
          title="No media yet"
          description="Drop video or audio files here to get started. Nothing is uploaded — files stay on your machine."
          action="Import media"
          actionLoading={isImporting}
          onAction={handleImport}
        />
        {importError && <PanelErrorNotice message={importError} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {importError && <PanelErrorNotice message={importError} />}
      {timelineError && <PanelErrorNotice message={timelineError} />}
      <button
        type="button"
        onClick={handleImport}
        aria-busy={isImporting || undefined}
        aria-disabled={isImporting || undefined}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
          'text-text-secondary transition-colors duration-[--duration-fast]',
          'hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
          'focus-visible:outline-[--color-border-focus]',
        )}
      >
        <FolderOpen className="size-3.5" aria-hidden="true" />
        Import more
      </button>

      <ul className="flex flex-col gap-0.5" aria-label="Imported media">
        {mediaItems.map((item) => {
          const ItemIcon = item.kind === 'audio' ? Music : Video;
          return (
            <li
              key={item.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5',
                'text-xs text-text-primary hover:bg-surface-hover',
              )}
              title={item.path}
            >
              <ItemIcon className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {item.name}
                <span className="block text-2xs text-text-tertiary">
                  {item.duration === null ? 'Duration unknown' : formatMediaDuration(item.duration)}
                </span>
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Add ${item.name} to the timeline`}
                className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={() => handleAddToTimeline(item)}
                leadingIcon={<Plus />}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatMediaDuration(duration: number): string {
  const totalSeconds = Math.round(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * A recoverable-error message for a failed panel action (import, or placing
 * a clip on the timeline).
 *
 * `role="alert"` so assistive tech announces it immediately — it appears in
 * response to a user action, not on page load, so it must not wait for the
 * user to stumble onto it.
 */
function PanelErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-2 py-1.5 text-xs text-danger">
      {message}
    </p>
  );
}
