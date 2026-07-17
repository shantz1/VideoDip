'use client';

import {
  EXPORT_PRESETS,
  waveformDocumentSchema,
  type ExportPresetId,
  type MediaArtifact,
  type MediaItem,
} from '@videodip/media-engine';
import {
  ms,
  type ProjectId,
  type ProjectSummary,
  type TranscriptionModelStatus,
} from '@videodip/shared';
import { findFreeStart } from '@videodip/timeline';
import { Button, cn, useTheme, type ThemeMode } from '@videodip/ui';
import { parseTemplate, resolveTemplate } from '@videodip/template-engine';
import type { SubtitleStyle } from '@videodip/subtitle-engine';
import {
  ArchiveRestore,
  FileArchive,
  FolderOpen,
  Image,
  LayoutTemplate,
  Music,
  Package,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore, type AspectRatio, type SidebarPanel } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import {
  deleteSavedProject,
  openSavedProject,
  renameSavedProject,
  startNewProject,
} from '../lib/project-commands';
import { transcriptionToSubtitles } from '../lib/transcription-to-subtitles';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';
import { EmptyState } from './empty-state';
import { useProjectArchiveController } from './project-archive-controller';

/**
 * Fallback only for containers the platform decoder cannot inspect yet.
 *
 * Used only when both the platform decoder and FFprobe fail to inspect a
 * source. Trimming can correct the placement until the file is relinked.
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
          'border-border-subtle bg-surface-base border-r',
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
          className={cn('border-border-subtle bg-surface-base flex w-60 flex-col border-r')}
          aria-label={active?.label}
        >
          <div className="flex h-9 shrink-0 items-center px-3">
            <h2 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
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
        <span className="bg-accent absolute left-0 h-4 w-0.5 rounded-r-full" aria-hidden="true" />
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
      return <TemplatesPanel />;
    case 'ai':
      return <AiPanel />;
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

function AiPanel() {
  const { transcription, transcriptionModels } = useEditorHost();
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const timeline = useProjectStore((state) => state.document);
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const replaceSubtitles = useSubtitleStore((state) => state.replace);
  const [models, setModels] = useState<readonly TranscriptionModelStatus[]>([]);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);
  const [assetId, setAssetId] = useState('');
  const [language, setLanguage] = useState('auto');
  const [languages, setLanguages] = useState<readonly string[]>(['auto']);
  const [modelId, setModelId] = useState(transcriptionModels.selected());
  const [phase, setPhase] = useState<{ stage: string; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = () =>
    void transcriptionModels.status().then((result) => {
      if (result.ok) {
        setModels(result.value.models);
        setRuntimeAvailable(result.value.runtimeAvailable);
      } else setError(result.error.recovery);
    });
  useEffect(() => refresh(), [transcriptionModels]);
  useEffect(() => {
    void transcription.capabilities().then((result) => {
      if (result.ok && result.value.languages !== 'auto') {
        setLanguages(['auto', ...result.value.languages]);
      }
    });
  }, [transcription]);
  useEffect(() => {
    if (!assetId && mediaItems[0]) setAssetId(mediaItems[0].id);
  }, [assetId, mediaItems]);

  const selectedModel = models.find((model) => model.id === modelId);
  const download = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ stage: 'Starting download', progress: 0 });
    setError(null);
    void transcriptionModels
      .download(modelId, (progress, stage) => setPhase({ progress, stage }), controller.signal)
      .then((result) => {
        setPhase(null);
        abortRef.current = null;
        if (!result.ok) setError(result.error.recovery);
        refresh();
      });
  };
  const deleteModel = () => {
    if (!window.confirm(`Delete the local ${modelId} speech model?`)) return;
    setPhase({ stage: 'Deleting model', progress: 0 });
    setError(null);
    void transcriptionModels.delete(modelId).then((result) => {
      setPhase(null);
      if (!result.ok) setError(result.error.recovery);
      refresh();
    });
  };
  const generate = () => {
    const media = mediaItems.find((item) => item.id === assetId);
    if (!media) return;
    const clip = timeline.tracks
      .flatMap((track) => track.clips)
      .filter((item) => item.assetId === media.id)
      .sort((left, right) => left.start - right.start)[0];
    if (clip === undefined) {
      setError('Add this media to the timeline before generating subtitles.');
      return;
    }
    if (
      subtitleDocument.segments.length > 0 &&
      !window.confirm('Replace the current subtitles with this AI transcription?')
    ) {
      return;
    }
    transcriptionModels.select(modelId);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ stage: 'Starting transcription', progress: 0 });
    setError(null);
    const options = {
      wordTimestamps: true,
      ...(language === 'auto' ? {} : { language }),
    };
    void transcription
      .transcribe(media.locator, options, controller.signal, (progress) =>
        setPhase({ stage: progress.stage, progress: progress.progress }),
      )
      .then((result) => {
        setPhase(null);
        abortRef.current = null;
        if (!result.ok) {
          setError(result.error.recovery);
          return;
        }
        const subtitles = transcriptionToSubtitles(result.value, clip);
        if (!subtitles.ok) {
          setError(subtitles.error.recovery);
          return;
        }
        replaceSubtitles(subtitles.value);
        useEditorStore.getState().setInspectorTab('subtitle');
      });
  };

  if (mediaItems.length === 0)
    return (
      <EmptyState
        icon={Sparkles}
        title="Auto subtitles"
        description="Import a video or audio file first. Speech recognition runs locally and nothing is uploaded."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-text-tertiary text-xs">
        {transcription.name} with multilingual word-level timestamps.
      </p>
      {!runtimeAvailable && (
        <PanelErrorNotice message="The local transcription runtime is missing from this build. Install a complete VideoDip Desktop build before transcription." />
      )}
      {error && <PanelErrorNotice message={error} />}
      <select
        aria-label="Media to transcribe"
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
        className="border-border-default bg-surface-inset h-8 rounded-md border px-2 text-xs"
      >
        {mediaItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Transcription language"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="border-border-default bg-surface-inset h-8 rounded-md border px-2 text-xs"
      >
        {languages.map((id) => (
          <option key={id} value={id}>
            {id === 'auto' ? 'Auto detect' : languageName(id)}
          </option>
        ))}
      </select>
      <select
        aria-label="Transcription model"
        value={modelId}
        onChange={(event) => {
          setModelId(event.target.value);
          transcriptionModels.select(event.target.value);
        }}
        className="border-border-default bg-surface-inset h-8 rounded-md border px-2 text-xs"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.id} · {model.quality} · {Math.round(model.sizeBytes / 1024 / 1024)} MB
          </option>
        ))}
      </select>
      {phase && (
        <p role="status" className="text-text-secondary text-xs">
          {phase.stage} · {Math.round(phase.progress * 100)}%
        </p>
      )}
      {!selectedModel?.installed ? (
        <Button size="sm" variant="secondary" disabled={phase !== null} onClick={download}>
          Download selected model
        </Button>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-1">
          <Button
            size="sm"
            variant="primary"
            disabled={phase !== null || !runtimeAvailable}
            onClick={generate}
          >
            Generate subtitles
          </Button>
          <Button size="sm" variant="ghost" disabled={phase !== null} onClick={deleteModel}>
            Delete
          </Button>
        </div>
      )}
      {phase && (
        <Button size="xs" variant="ghost" onClick={() => abortRef.current?.abort()}>
          Cancel
        </Button>
      )}
    </div>
  );
}

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

function languageName(code: string): string {
  return LANGUAGE_NAMES.of(code) ?? code.toUpperCase();
}

const CAPTION_TEMPLATES = [
  {
    version: 1,
    id: 'builtin.caption-clean',
    name: 'Clean',
    description: 'Centered, readable captions.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 48, isBold: true, positionY: 0.88 },
  },
  {
    version: 1,
    id: 'builtin.caption-compact',
    name: 'Compact',
    description: 'Smaller captions with more breathing room.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 38, isBold: false, positionY: 0.84 },
  },
  {
    version: 1,
    id: 'builtin.caption-headline',
    name: 'Headline',
    description: 'Large bold captions for short-form video.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 64, isBold: true, positionY: 0.78 },
  },
] as const;

function TemplatesPanel() {
  const currentStyle = useSubtitleStore((state) => state.document.defaultStyle);
  const setDefaultStyle = useSubtitleStore((state) => state.setDefaultStyle);
  const [error, setError] = useState<string | null>(null);

  const apply = (source: unknown) => {
    const parsed = parseTemplate(source);
    if (!parsed.ok) {
      setError(parsed.error.recovery);
      return;
    }
    const resolved = resolveTemplate(parsed.value, {});
    if (
      !resolved.ok ||
      resolved.value === null ||
      typeof resolved.value !== 'object' ||
      Array.isArray(resolved.value)
    ) {
      setError(resolved.ok ? 'Choose a valid subtitle style template.' : resolved.error.recovery);
      return;
    }
    const payload = resolved.value as Partial<SubtitleStyle>;
    setDefaultStyle({ ...currentStyle, ...payload });
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-tertiary text-xs">
        Templates are validated JSON data and affect every cue that has not overridden the style.
      </p>
      {error && <PanelErrorNotice message={error} />}
      {CAPTION_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => apply(template)}
          className="border-border-subtle hover:bg-surface-hover rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-[--color-border-focus]"
        >
          <span className="text-text-primary block text-sm font-medium">{template.name}</span>
          <span className="text-text-tertiary mt-0.5 block text-xs">{template.description}</span>
        </button>
      ))}
    </div>
  );
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
  const exportPresetId = useEditorStore((state) => state.exportPresetId);
  const setExportPreset = useEditorStore((state) => state.setExportPreset);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-secondary text-xs font-medium">Appearance</p>
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

      <p className="text-text-secondary mt-3 text-xs font-medium">Aspect ratio</p>
      <AspectRatioSelector />

      <p className="text-text-secondary mt-3 text-xs font-medium">Export preset</p>
      <select
        value={exportPresetId}
        onChange={(event) => setExportPreset(event.target.value as ExportPresetId)}
        className="border-border-default bg-surface-inset text-text-primary h-8 rounded-md border px-2 text-xs"
      >
        {EXPORT_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} · {preset.width}×{preset.height} · {preset.fps} fps
          </option>
        ))}
      </select>
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
 * The Projects panel's current behaviour: starts a new durable project.
 *
 * No project list yet — this panel stays the empty state even after creating
 * one yet; startup restores the newest local snapshot automatically. Resets
 * `project.store.ts`'s document too — a "new" project starting with the
 * previous one's clips would be a bug, not a feature. The visible effect is
 * the toolbar's project name, the unsaved-changes indicator, and the
 * timeline clearing.
 */
function ProjectsPanel() {
  const { projects } = useEditorHost();
  const archiveController = useProjectArchiveController();
  const projectId = useEditorStore((s) => s.projectId);
  const projectName = useEditorStore((s) => s.projectName);
  const isDirty = useEditorStore((s) => s.isDirty);
  const [summaries, setSummaries] = useState<readonly ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ProjectId | null>(null);
  const [renamingId, setRenamingId] = useState<ProjectId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void projects.list(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setSummaries(result.value);
        setProjectError(null);
      } else {
        setProjectError(result.error.recovery);
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [isDirty, projectId, projects]);

  const handleNewProject = () => {
    setBusyId('new');
    setProjectError(null);
    void startNewProject(projects).then((result) => {
      if (!result.ok) setProjectError(result.error.recovery);
      setBusyId(null);
    });
  };

  const handleOpen = (id: ProjectId) => {
    setBusyId(id);
    setProjectError(null);
    void openSavedProject(projects, id).then((result) => {
      if (!result.ok) setProjectError(result.error.recovery);
      setBusyId(null);
    });
  };

  const handleDelete = (id: ProjectId) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setBusyId(id);
    setProjectError(null);
    void deleteSavedProject(projects, id).then((result) => {
      if (result.ok) {
        setSummaries((current) => current.filter((project) => project.id !== id));
      } else {
        setProjectError(result.error.recovery);
      }
      setConfirmDeleteId(null);
      setBusyId(null);
    });
  };

  const beginRename = (project: ProjectSummary) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
    setConfirmDeleteId(null);
  };

  const commitRename = (id: ProjectId) => {
    setBusyId(id);
    setProjectError(null);
    void renameSavedProject(projects, id, renameValue).then((result) => {
      if (result.ok) {
        const name = renameValue.trim();
        setSummaries((current) =>
          current.map((project) => (project.id === id ? { ...project, name } : project)),
        );
        setRenamingId(null);
      } else {
        setProjectError(result.error.recovery);
      }
      setBusyId(null);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-text-primary truncate text-sm font-medium">
          {projectName ?? 'No project open'}
        </p>
        <p className="text-text-tertiary text-xs">
          {isDirty ? 'Saving changes…' : 'Saved locally'}
        </p>
      </div>

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        leadingIcon={<Plus />}
        loading={busyId === 'new'}
        onClick={handleNewProject}
      >
        New project
      </Button>

      <div className="grid grid-cols-2 gap-1">
        <Button
          variant="outline"
          size="xs"
          leadingIcon={<ArchiveRestore />}
          loading={archiveController.phase.kind === 'importing'}
          disabled={archiveController.isBusy && archiveController.phase.kind !== 'importing'}
          onClick={() => void archiveController.importArchive()}
        >
          Import
        </Button>
        <Button
          variant="outline"
          size="xs"
          leadingIcon={<FileArchive />}
          loading={
            archiveController.phase.kind === 'exporting' &&
            archiveController.phase.mode === 'portable'
          }
          disabled={
            projectId === null ||
            (archiveController.isBusy &&
              !(
                archiveController.phase.kind === 'exporting' &&
                archiveController.phase.mode === 'portable'
              ))
          }
          onClick={() => void archiveController.exportPortable()}
        >
          Export
        </Button>
      </div>
      <Button
        variant="ghost"
        size="xs"
        loading={
          archiveController.phase.kind === 'exporting' && archiveController.phase.mode === 'linked'
        }
        disabled={
          projectId === null ||
          (archiveController.isBusy &&
            !(
              archiveController.phase.kind === 'exporting' &&
              archiveController.phase.mode === 'linked'
            ))
        }
        onClick={() => void archiveController.exportLinked()}
      >
        Export smaller linked archive
      </Button>

      {projectError && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {projectError}
        </p>
      )}

      <div className="border-border-subtle border-t pt-2">
        <p className="text-text-tertiary mb-1.5 text-xs font-medium uppercase">Saved projects</p>
        {loading ? (
          <p className="text-text-tertiary py-3 text-center text-xs">Loading…</p>
        ) : summaries.length === 0 ? (
          <p className="text-text-tertiary py-3 text-center text-xs">No saved projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {summaries.map((project) => {
              const active = project.id === projectId;
              const confirming = confirmDeleteId === project.id;
              const renaming = renamingId === project.id;
              return (
                <li
                  key={project.id}
                  className={cn(
                    'border-border-subtle rounded-md border p-2',
                    active && 'bg-surface-selected border-border-default',
                  )}
                >
                  {renaming ? (
                    <input
                      autoFocus
                      aria-label={`Rename ${project.name}`}
                      value={renameValue}
                      maxLength={160}
                      className="border-border-default bg-surface-inset text-text-primary focus:border-border-focus w-full rounded-sm border px-1.5 py-1 text-xs outline-none"
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(project.id);
                        if (event.key === 'Escape') setRenamingId(null);
                      }}
                    />
                  ) : (
                    <p className="text-text-primary truncate text-xs font-medium">{project.name}</p>
                  )}
                  <p className="text-text-tertiary text-2xs mt-0.5">
                    {new Date(project.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {renaming ? (
                      <>
                        <Button
                          size="xs"
                          variant="primary"
                          loading={busyId === project.id}
                          onClick={() => commitRename(project.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busyId !== null}
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyId !== null}
                        leadingIcon={<Pencil />}
                        onClick={() => beginRename(project)}
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant={active ? 'secondary' : 'ghost'}
                      disabled={renaming || active || busyId !== null}
                      loading={busyId === project.id && !confirming}
                      onClick={() => handleOpen(project.id)}
                    >
                      {active ? 'Open' : 'Open project'}
                    </Button>
                    <Button
                      size="xs"
                      variant={confirming ? 'danger' : 'ghost'}
                      disabled={renaming || active || (busyId !== null && busyId !== project.id)}
                      loading={busyId === project.id && confirming}
                      leadingIcon={<Trash2 />}
                      onClick={() => handleDelete(project.id)}
                    >
                      {confirming ? 'Confirm' : 'Delete'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
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
  const { getMediaArtifact, importMedia, resolveMediaSource } = useEditorHost();
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const addMediaItems = useEditorStore((s) => s.addMediaItems);
  const playhead = useEditorStore((s) => s.playhead);
  const timelineDocument = useProjectStore((s) => s.document);
  const addClip = useProjectStore((s) => s.addClip);
  const [importError, setImportError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [artifactStates, setArtifactStates] = useState<
    Readonly<Record<string, MediaArtifactViewState>>
  >({});

  useEffect(() => {
    const controllers = mediaItems.map((item) => {
      const controller = new AbortController();
      setArtifactStates((current) => ({
        ...current,
        [item.id]: { kind: 'loading', ratio: 0 },
      }));
      void getMediaArtifact(mediaArtifactRequest(item), {
        signal: controller.signal,
        onProgress: (progress) => {
          setArtifactStates((current) => ({
            ...current,
            [item.id]: { kind: 'loading', ratio: progress.ratio },
          }));
        },
      }).then((result) => {
        if (controller.signal.aborted) return;
        setArtifactStates((current) => ({
          ...current,
          [item.id]: result.ok
            ? { kind: 'ready', artifact: result.value }
            : { kind: 'error', recovery: result.error.recovery },
        }));
      });
      return controller;
    });
    return () => controllers.forEach((controller) => controller.abort());
  }, [getMediaArtifact, mediaItems]);

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
    const trackId = timelineDocument.tracks.find((track) => track.kind === item.kind)?.id;
    if (!trackId) {
      setTimelineError(`Add a ${item.kind} track before placing this media.`);
      return;
    }
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
          const artifactState = artifactStates[item.id];
          return (
            <li
              key={item.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5',
                'text-text-primary hover:bg-surface-hover text-xs',
              )}
              title={String(item.locator)}
            >
              {artifactState?.kind === 'ready' && artifactState.artifact.kind === 'thumbnail' ? (
                <img
                  src={resolveMediaSource(artifactState.artifact.locator)}
                  alt=""
                  className="bg-surface-inset h-9 w-14 shrink-0 rounded-sm object-cover"
                />
              ) : artifactState?.kind === 'ready' && artifactState.artifact.kind === 'waveform' ? (
                <WaveformPreview
                  source={resolveMediaSource(artifactState.artifact.locator)}
                  label={`${item.name} waveform`}
                />
              ) : (
                <span className="bg-surface-inset flex h-9 w-14 shrink-0 items-center justify-center rounded-sm">
                  <ItemIcon className="text-text-tertiary size-4" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {item.name}
                <span className="text-2xs text-text-tertiary block">
                  {item.duration === null ? 'Duration unknown' : formatMediaDuration(item.duration)}
                </span>
                <MediaArtifactStatus state={artifactState} />
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Add ${item.name} to the timeline`}
                className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
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

type MediaArtifactViewState =
  | { readonly kind: 'loading'; readonly ratio: number }
  | { readonly kind: 'ready'; readonly artifact: MediaArtifact }
  | { readonly kind: 'error'; readonly recovery: string };

function mediaArtifactRequest(item: MediaItem) {
  const sourceVersion = `size:${item.metadata?.sizeBytes ?? 'unknown'};duration:${item.duration ?? 'unknown'};format:${item.metadata?.format.slice(0, 80) ?? 'unknown'}`;
  return {
    assetId: item.id,
    source: item.locator,
    sourceVersion,
    options:
      item.kind === 'audio'
        ? ({ kind: 'waveform', samples: 96 } as const)
        : ({
            kind: 'thumbnail',
            time: ms(Math.min(item.duration === null ? 1_000 : item.duration / 2, 1_000)),
            width: 160,
            height: 90,
            format: 'jpeg',
          } as const),
  };
}

function MediaArtifactStatus({ state }: { readonly state: MediaArtifactViewState | undefined }) {
  if (state === undefined) return null;
  if (state.kind === 'loading') {
    return (
      <span className="text-2xs text-text-tertiary block" aria-live="polite">
        Generating previewâ€¦ {Math.round(state.ratio * 100)}%
      </span>
    );
  }
  if (state.kind === 'error') {
    return (
      <span className="text-2xs text-danger block truncate" title={state.recovery}>
        Preview unavailable
      </span>
    );
  }
  return (
    <span className="text-2xs text-text-tertiary block">
      {state.artifact.kind === 'waveform' ? 'Waveform cached' : 'Thumbnail cached'}
    </span>
  );
}

function WaveformPreview({ source, label }: { readonly source: string; readonly label: string }) {
  const [peaks, setPeaks] = useState<readonly number[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(source, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('waveform'))))
      .then((value: unknown) => {
        const parsed = waveformDocumentSchema.safeParse(value);
        if (parsed.success) setPeaks(parsed.data.peaks);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [source]);

  if (peaks === null) {
    return (
      <span className="bg-surface-inset flex h-9 w-14 shrink-0 items-center justify-center rounded-sm">
        <Music className="text-text-tertiary size-4" aria-hidden="true" />
      </span>
    );
  }
  const points = peaks
    .map((peak, index) => {
      const x = peaks.length === 1 ? 0 : (index / (peaks.length - 1)) * 100;
      return `${x},${50 - peak * 45}`;
    })
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      className="bg-surface-inset text-track-audio h-9 w-14 shrink-0 rounded-sm"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" />
      <polyline
        points={points
          .split(' ')
          .map((point) => {
            const [x = '0', y = '50'] = point.split(',');
            return `${x},${100 - Number(y)}`;
          })
          .join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
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
    <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
      {message}
    </p>
  );
}
