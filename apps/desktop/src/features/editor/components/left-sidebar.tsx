'use client';

import { cn } from '@videodip/ui';
import {
  FolderOpen,
  Image,
  LayoutTemplate,
  Package,
  Settings,
  Sparkles,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useEditorStore, type SidebarPanel } from '../editor.store';
import { EmptyState } from './empty-state';

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
          className={cn(
            'flex w-60 flex-col border-r border-border-subtle bg-surface-base',
          )}
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
        <span
          className="absolute left-0 h-4 w-0.5 rounded-r-full bg-accent"
          aria-hidden="true"
        />
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
      return (
        <EmptyState
          icon={Video}
          title="No media yet"
          description="Drop video or audio files here to get started. Nothing is uploaded — files stay on your machine."
          action="Import media"
        />
      );
    case 'projects':
      return (
        <EmptyState
          icon={FolderOpen}
          title="No projects"
          description="Your projects are saved locally as .videodip archives."
          action="New project"
        />
      );
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
        <EmptyState icon={Type} title="Fonts" description="Bundled and system fonts for captions." />
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
      return (
        <EmptyState icon={Settings} title="Settings" description="Preferences and configuration." />
      );
  }
}
