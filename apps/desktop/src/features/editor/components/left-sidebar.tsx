'use client';

import {
  EXPORT_PRESETS,
  waveformDocumentSchema,
  type ExportPresetId,
  type MediaArtifact,
  type MediaItem,
} from '@videodip/media-engine';
import {
  mediaLocatorSchema,
  ms,
  type ProjectId,
  type ProjectSummary,
  type TranscriptionModelStatus,
} from '@videodip/shared';
import { findFreeStart, type TimelineSelectionRef } from '@videodip/timeline';
import { Button, cn, useTheme, type ThemeMode } from '@videodip/ui';
import { parseTemplate, resolveTemplate, type TemplateDefinition } from '@videodip/template-engine';
import { resolveSubtitleStyle, type SubtitleStyle } from '@videodip/subtitle-engine';
import {
  ArchiveRestore,
  FileArchive,
  FolderOpen,
  Image,
  LayoutGrid,
  List,
  Music,
  Package,
  Pencil,
  Play,
  Plus,
  Puzzle,
  Settings,
  Shuffle,
  Sparkles,
  Trash2,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore, type AspectRatio, type SidebarPanel } from '../editor.store';
import { useEditorHost } from '../host/editor-host';
import {
  deleteSavedProject,
  openSavedProject,
  renameSavedProject,
  startNewProject,
} from '../lib/project-commands';
import { flattenTimelineAudio } from '../lib/transcribe-timeline';
import { transcriptionToSubtitles } from '../lib/transcription-to-subtitles';
import { usePluginStore } from '../plugin.store';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';
import { EmptyState } from './empty-state';
import { useProjectArchiveController } from './project-archive-controller';
import { SourceVideoThumbnail } from './source-video-thumbnail';

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
  { id: 'templates', label: 'Text styles', icon: Type },
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
    <div className="flex h-full w-full min-w-0 shrink-0">
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
          className={cn(
            'border-border-subtle bg-surface-base flex min-w-0 flex-1 flex-col border-r',
          )}
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
        'transition-colors duration-(--duration-fast)',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        'focus-visible:outline-(--color-border-focus)',
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
      return <TextStylesPanel />;
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

/** Sentinel id for the whole-timeline source in the transcription selector. */
const TIMELINE_SOURCE = '__timeline__';

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
  const hasTimelineClips = timeline.tracks.some((track) =>
    track.clips.some((item) => item.isEnabled),
  );
  useEffect(() => {
    // Whole-timeline is the default because its timestamps land in timeline
    // time and cover every clip; a lone imported file is the fallback.
    if (assetId) return;
    if (hasTimelineClips) setAssetId(TIMELINE_SOURCE);
    else if (mediaItems[0]) setAssetId(mediaItems[0].id);
  }, [assetId, hasTimelineClips, mediaItems]);

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
  /**
   * Whole-timeline mode: flatten every audible clip to one WAV (clips
   * delayed to their real positions), transcribe it once, and import the
   * segments directly — the recognizer's timestamps are already timeline
   * time, so multi-clip projects caption correctly with no offset math.
   */
  const generateFromTimeline = () => {
    if (
      subtitleDocument.segments.length > 0 &&
      !window.confirm('Replace the current subtitles with this AI transcription?')
    ) {
      return;
    }
    transcriptionModels.select(modelId);
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPhase({ stage: 'Preparing timeline audio', progress: 0 });
    const pathByAsset = new Map(mediaItems.map((item) => [item.id, String(item.locator)]));
    const options = {
      wordTimestamps: true,
      ...(language === 'auto' ? {} : { language }),
    };
    void flattenTimelineAudio(
      timeline,
      (id) => pathByAsset.get(id),
      (fraction) => setPhase({ stage: 'Preparing timeline audio', progress: fraction }),
      controller.signal,
    ).then(async (flattened) => {
      if (!flattened.ok) {
        setPhase(null);
        abortRef.current = null;
        setError(flattened.error.recovery);
        return;
      }
      const result = await transcription.transcribe(
        mediaLocatorSchema.parse(flattened.value.path),
        options,
        controller.signal,
        (progress) => setPhase({ stage: progress.stage, progress: progress.progress }),
      );
      setPhase(null);
      abortRef.current = null;
      if (!result.ok) {
        setError(result.error.recovery);
        return;
      }
      const subtitles = transcriptionToSubtitles(result.value, {
        start: ms(0),
        sourceStart: ms(0),
        duration: flattened.value.durationMs,
      });
      if (!subtitles.ok) {
        setError(subtitles.error.recovery);
        return;
      }
      replaceSubtitles(subtitles.value);
      useEditorStore.getState().setInspectorTab('subtitle');
    });
  };

  const generate = () => {
    if (assetId === TIMELINE_SOURCE) {
      generateFromTimeline();
      return;
    }
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
        <option value={TIMELINE_SOURCE} disabled={!hasTimelineClips}>
          {hasTimelineClips
            ? 'Whole timeline (all audible clips)'
            : 'Whole timeline — add clips first'}
        </option>
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

/**
 * Built-in subtitle style templates. Every field is data validated by
 * `@videodip/template-engine`'s Zod schema and resolves onto
 * `SubtitleDocument.defaultStyle` — see `TextStylesPanel.apply` below. Fonts
 * reference the bundled caption font pack (`@videodip/renderer`'s
 * `caption-fonts.css`); everything renders identically offline.
 */
export const CAPTION_TEMPLATES = [
  {
    version: 1,
    id: 'builtin.caption-clean',
    name: 'Clean',
    description: 'Centered, readable captions.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 48, fontWeight: 700, positionY: 0.88 },
  },
  {
    version: 1,
    id: 'builtin.caption-compact',
    name: 'Compact',
    description: 'Smaller captions with more breathing room.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 38, fontWeight: 400, positionY: 0.84 },
  },
  {
    version: 1,
    id: 'builtin.caption-headline',
    name: 'Headline',
    description: 'Large bold captions for short-form video.',
    surface: 'subtitle',
    parameters: [],
    payload: { fontSize: 64, fontWeight: 700, positionY: 0.78 },
  },
  {
    version: 1,
    id: 'builtin.caption-bold-impact',
    name: 'Bold Impact',
    description: 'Huge yellow display type with a thick outline and a bounce-in.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Anton',
      fontSize: 72,
      fontWeight: 400,
      foreground: '#ffde59',
      backgroundEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 4,
      positionY: 0.72,
      animation: 'bounce',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-neon-pop',
    name: 'Neon Pop',
    description: 'Glowing cyan-on-magenta condensed type with a quick pop-in.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Oswald',
      fontSize: 56,
      fontWeight: 700,
      foreground: '#00f0ff',
      backgroundEnabled: false,
      shadowColor: '#ff00e5',
      shadowBlur: 20,
      shadowOpacity: 0.9,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animation: 'pop',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-boxed',
    name: 'Boxed',
    description: 'Bold white type on a solid black card — high-contrast and legible.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Montserrat',
      fontSize: 48,
      fontWeight: 700,
      foreground: '#ffffff',
      backgroundEnabled: true,
      background: '#000000',
      backgroundOpacity: 0.85,
      padding: 16,
      borderRadius: 10,
      animation: 'fade',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-elegant-serif',
    name: 'Elegant Serif',
    description: 'Understated serif captions with a soft shadow — a cinematic, editorial feel.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Playfair Display',
      fontSize: 42,
      fontWeight: 700,
      foreground: '#f5f1e8',
      backgroundEnabled: false,
      shadowColor: '#000000',
      shadowBlur: 8,
      shadowOpacity: 0.5,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      positionY: 0.85,
      animation: 'slide-up',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-handwritten',
    name: 'Handwritten',
    description: 'A playful script face with a violet outline, sliding in from the side.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Caveat',
      fontSize: 64,
      fontWeight: 700,
      foreground: '#ffffff',
      backgroundEnabled: false,
      strokeColor: '#7c3aed',
      strokeWidth: 2,
      animation: 'slide-left',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-marker',
    name: 'Marker Bold',
    description: 'A tilted, orange marker-style scrawl with an energetic bounce.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Permanent Marker',
      fontSize: 52,
      fontWeight: 400,
      foreground: '#ff5a36',
      backgroundEnabled: false,
      rotation: -3,
      animation: 'bounce',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-minimal-white',
    name: 'Minimal White',
    description: 'Small, quiet white captions with a soft drop shadow — stays out of the way.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Poppins',
      fontSize: 40,
      fontWeight: 600,
      foreground: '#ffffff',
      backgroundEnabled: false,
      shadowColor: '#000000',
      shadowBlur: 6,
      shadowOpacity: 0.6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      positionY: 0.9,
      animation: 'fade',
    },
  },
  {
    version: 1,
    id: 'builtin.caption-big-bold-center',
    name: 'Big Bold Center',
    description: 'Tall condensed display type, centered on screen, with a punchy scale-in.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Bebas Neue',
      fontSize: 80,
      fontWeight: 400,
      foreground: '#ffffff',
      backgroundEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 3,
      letterSpacing: 2,
      positionY: 0.5,
      animation: 'pop',
    },
  },
] as const;

export function TextStylesPanel() {
  const subtitleDocument = useSubtitleStore((state) => state.document);
  const setDefaultStyle = useSubtitleStore((state) => state.setDefaultStyle);
  const applyStyleToSegments = useSubtitleStore((state) => state.applyStyleToSegments);
  const applyStyleToAll = useSubtitleStore((state) => state.applyStyleToAll);
  const selectionRefs = useSessionStore((state) => state.session.selection.refs);
  const select = useSessionStore((state) => state.select);
  const extendSelect = useSessionStore((state) => state.extendSelect);
  const pluginTemplates = usePluginStore((state) => state.templates);
  const [error, setError] = useState<string | null>(null);
  const [lastAppliedId, setLastAppliedId] = useState<string | null>(null);
  const selectedSubtitleIds = useMemo(
    () => selectionRefs.filter((ref) => ref.type === 'subtitle-segment').map((ref) => ref.id),
    [selectionRefs],
  );
  // CAPTION_TEMPLATES' literal `id` strings satisfy templateIdSchema at
  // runtime (validated by the `is data` test below) but aren't branded
  // TemplateId at the type level; the cast reconciles that with plugin
  // templates, which come out of parseTemplate already branded.
  const allTemplates: readonly TemplateDefinition[] = useMemo(
    () => [...(CAPTION_TEMPLATES as unknown as readonly TemplateDefinition[]), ...pluginTemplates],
    [pluginTemplates],
  );

  const apply = (source: TemplateDefinition, target: 'selection-or-default' | 'all') => {
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
    const result =
      target === 'all'
        ? applyStyleToAll(payload)
        : selectedSubtitleIds.length > 0
          ? applyStyleToSegments(selectedSubtitleIds, payload)
          : null;
    if (result !== null && !result.ok) {
      setError(result.error.recovery);
      return;
    }
    if (result === null) {
      setDefaultStyle({ ...subtitleDocument.defaultStyle, ...payload });
    }
    setLastAppliedId(source.id);
    setError(null);
  };

  // Picks a different template than the one just applied, so repeated clicks
  // always visibly change the look instead of occasionally no-op'ing.
  const applyAuto = () => {
    const candidates = allTemplates.filter((template) => template.id !== lastAppliedId);
    const pool = candidates.length > 0 ? candidates : allTemplates;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    if (choice) apply(choice, 'selection-or-default');
  };

  const selectAllSubtitles = () => {
    const refs = subtitleDocument.segments.map(
      (segment): TimelineSelectionRef => ({ type: 'subtitle-segment', id: segment.id }),
    );
    const first = refs[0];
    const last = refs.at(-1);
    if (!first || !last) return;
    select(first);
    if (refs.length > 1) extendSelect(last, refs);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-tertiary text-xs">
        Apply a visual style to selected timeline subtitles, or apply it to every subtitle.
      </p>
      <div className="border-border-subtle bg-surface-inset flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
        <span className="text-text-secondary text-xs">
          {selectedSubtitleIds.length > 0
            ? `${selectedSubtitleIds.length} subtitle${selectedSubtitleIds.length === 1 ? '' : 's'} selected`
            : 'No subtitles selected'}
        </span>
        <Button
          size="xs"
          variant="ghost"
          disabled={subtitleDocument.segments.length === 0}
          onClick={selectAllSubtitles}
        >
          Select all
        </Button>
      </div>
      {error && <PanelErrorNotice message={error} />}
      <Button size="sm" variant="secondary" leadingIcon={<Shuffle />} onClick={applyAuto}>
        Auto style
      </Button>
      {allTemplates.map((template) => (
        <article
          key={template.id}
          aria-label={`${template.name} text style`}
          className="border-border-subtle bg-surface-raised overflow-hidden rounded-md border"
        >
          <TextStylePreview
            style={resolveSubtitleStyle(
              subtitleDocument.defaultStyle,
              template.payload as Partial<SubtitleStyle>,
            )}
          />
          <div className="flex flex-col gap-2 p-2.5">
            <div>
              <span className="text-text-primary block text-sm font-medium">{template.name}</span>
              <span className="text-text-tertiary mt-0.5 block text-xs">
                {template.description}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                className="min-w-0 flex-1"
                onClick={() => apply(template, 'selection-or-default')}
              >
                {selectedSubtitleIds.length > 0
                  ? `Apply to selected (${selectedSubtitleIds.length})`
                  : 'Set as default'}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={subtitleDocument.segments.length === 0}
                onClick={() => apply(template, 'all')}
              >
                Apply to all
              </Button>
            </div>
          </div>
        </article>
      ))}
      <PluginManagerSection />
    </div>
  );
}

/**
 * Local-folder plugin install/enable UI (ADR-0009 Phase 5 v1 — see
 * `docs/adr/0009-phase-5-plugin-runtime-v1.md`). No registry, no download:
 * the user points at a folder containing `manifest.json` and its entrypoint.
 * The only capability wired up today is subtitle template registration,
 * which surfaces its result in the template grid above.
 */
function PluginManagerSection() {
  const plugins = usePluginStore((state) => state.plugins);
  const isInstalling = usePluginStore((state) => state.isInstalling);
  const installFromFolder = usePluginStore((state) => state.installFromFolder);
  const setEnabled = usePluginStore((state) => state.setEnabled);
  const uninstall = usePluginStore((state) => state.uninstall);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    const result = await installFromFolder();
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="border-border-subtle mt-2 flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary flex items-center gap-1.5 text-xs font-medium">
          <Puzzle className="size-3.5" aria-hidden="true" />
          Plugins
        </span>
        <Button
          size="xs"
          variant="ghost"
          loading={isInstalling}
          onClick={() => void handleInstall()}
        >
          Install from folder
        </Button>
      </div>
      {error && <PanelErrorNotice message={error} />}
      {plugins.length === 0 ? (
        <p className="text-text-tertiary text-xs">
          No plugins installed. A plugin can add subtitle style templates.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {plugins.map((plugin) => (
            <li
              key={plugin.manifest.id}
              className="border-border-subtle bg-surface-raised flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <div className="min-w-0">
                <span className="text-text-primary block truncate text-xs font-medium">
                  {plugin.manifest.name}{' '}
                  <span className="text-text-tertiary font-normal">v{plugin.manifest.version}</span>
                </span>
                {plugin.fault && <span className="text-danger block text-2xs">{plugin.fault}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  aria-pressed={plugin.enabled}
                  className={cn(plugin.enabled && 'bg-surface-selected text-accent')}
                  onClick={() => setEnabled(plugin.manifest.id, !plugin.enabled)}
                >
                  {plugin.enabled ? 'Enabled' : 'Disabled'}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Uninstall ${plugin.manifest.name}`}
                  onClick={() => uninstall(plugin.manifest.id)}
                  leadingIcon={<Trash2 />}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact, data-driven sample of a fully resolved subtitle style. */
function TextStylePreview({ style }: { readonly style: SubtitleStyle }) {
  const previewFontSize = Math.max(14, Math.min(30, style.fontSize / 2));
  const background = style.backgroundEnabled
    ? cssColorWithOpacity(style.background, style.backgroundOpacity)
    : 'transparent';
  const shadow =
    style.shadowOpacity > 0
      ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${cssColorWithOpacity(
          style.shadowColor,
          style.shadowOpacity,
        )}`
      : undefined;

  return (
    <div
      data-text-style-preview
      className="bg-surface-sunken flex h-20 items-center justify-center overflow-hidden px-3"
    >
      <span
        className="max-w-full truncate"
        style={{
          fontFamily: style.fontFamily,
          fontSize: `${previewFontSize}px`,
          fontWeight: style.fontWeight,
          fontStyle: style.isItalic ? 'italic' : 'normal',
          textDecoration: style.isUnderlined ? 'underline' : 'none',
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineHeight,
          color: style.foreground,
          opacity: style.opacity,
          background,
          padding: style.backgroundEnabled ? Math.min(style.padding / 2, 8) : 0,
          borderRadius: style.backgroundEnabled ? Math.min(style.borderRadius / 2, 8) : 0,
          textAlign: style.alignment,
          WebkitTextStroke:
            style.strokeWidth > 0
              ? `${Math.min(style.strokeWidth, 2)}px ${style.strokeColor}`
              : undefined,
          paintOrder: 'stroke fill',
          textShadow: shadow,
          transform: `rotate(${style.rotation}deg) scale(${Math.min(style.scale, 1.15)})`,
        }}
      >
        Your captions
      </span>
    </div>
  );
}

/** Preserves template color opacity without introducing UI palette values. */
function cssColorWithOpacity(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
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
            {preset.name} · project ratio · {preset.fps} fps
          </option>
        ))}
      </select>
    </div>
  );
}

const ASPECT_RATIOS: readonly AspectRatio[] = ['9:16', '3:4', '4:5', '1:1', '16:9'];

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
export function ProjectsPanel() {
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
                      aria-label={
                        confirming ? `Confirm delete ${project.name}` : `Delete ${project.name}`
                      }
                      disabled={renaming || (busyId !== null && busyId !== project.id)}
                      loading={busyId === project.id && confirming}
                      leadingIcon={<Trash2 />}
                      onClick={() => handleDelete(project.id)}
                    >
                      {confirming ? (active ? 'Delete open project' : 'Confirm delete') : 'Delete'}
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
 * Imports and auditions source media, presents generated or decoder-backed
 * previews in square-grid and compact-list views, and places clips on the
 * matching timeline track at the first free position from the playhead.
 */
export function MediaPanel() {
  const { getMediaArtifact, importMedia, resolveMediaSource } = useEditorHost();
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const mediaLibraryView = useEditorStore((s) => s.mediaLibraryView);
  const setMediaLibraryView = useEditorStore((s) => s.setMediaLibraryView);
  const mediaPreviewAssetId = useEditorStore((s) => s.mediaPreviewAssetId);
  const setMediaPreview = useEditorStore((s) => s.setMediaPreview);
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
  const [sourcePreviewAvailability, setSourcePreviewAvailability] = useState<
    Readonly<Record<string, boolean>>
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
      <div className="flex items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Media library view"
          className="border-border-subtle bg-surface-inset flex items-center rounded-md border p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mediaLibraryView === 'grid'}
            aria-label="Grid view"
            title="Grid view"
            onClick={() => setMediaLibraryView('grid')}
            className={cn(
              'grid size-6 place-items-center rounded-sm',
              'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
              mediaLibraryView === 'grid'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mediaLibraryView === 'list'}
            aria-label="List view"
            title="List view"
            onClick={() => setMediaLibraryView('list')}
            className={cn(
              'grid size-6 place-items-center rounded-sm',
              'focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
              mediaLibraryView === 'list'
                ? 'bg-surface-raised text-text-primary shadow-sm'
                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <List className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <Button
          size="xs"
          variant="outline"
          leadingIcon={<FolderOpen />}
          loading={isImporting}
          onClick={handleImport}
        >
          Import
        </Button>
      </div>

      <ul
        className={cn(
          mediaLibraryView === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-0.5',
        )}
        aria-label="Imported media"
        data-media-library-view={mediaLibraryView}
      >
        {mediaItems.map((item) => {
          const artifactState = artifactStates[item.id];
          const onSourcePreviewAvailability = (isAvailable: boolean) =>
            setSourcePreviewAvailability((current) =>
              current[item.id] === isAvailable ? current : { ...current, [item.id]: isAvailable },
            );
          return mediaLibraryView === 'grid' ? (
            <li
              key={item.id}
              className={cn(
                'group border-border-subtle min-w-0 overflow-hidden rounded-lg border',
                'bg-surface-raised hover:border-border-default text-text-primary',
              )}
              title={String(item.locator)}
            >
              <div
                className="relative aspect-square overflow-hidden"
                data-media-thumbnail-shape="square"
              >
                <MediaItemPreview
                  item={item}
                  state={artifactState}
                  source={resolveMediaSource(
                    artifactState?.kind === 'ready' ? artifactState.artifact.locator : item.locator,
                  )}
                  layout="grid"
                  onSourcePreviewAvailability={onSourcePreviewAvailability}
                />
                {item.duration !== null && (
                  <span className="bg-surface-overlay text-text-primary text-2xs absolute right-1 bottom-1 rounded-sm px-1 py-0.5 shadow-sm">
                    {formatMediaDuration(item.duration)}
                  </span>
                )}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    size="icon-sm"
                    variant={mediaPreviewAssetId === item.id ? 'primary' : 'secondary'}
                    aria-label={`Preview ${item.name}`}
                    aria-pressed={mediaPreviewAssetId === item.id}
                    className="shadow-sm"
                    onClick={() =>
                      setMediaPreview(mediaPreviewAssetId === item.id ? null : item.id)
                    }
                    leadingIcon={<Play />}
                  />
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`Add ${item.name} to the timeline`}
                    className="shadow-sm"
                    onClick={() => handleAddToTimeline(item)}
                    leadingIcon={<Plus />}
                  />
                </div>
              </div>
              <div className="min-w-0 p-2">
                <p className="truncate text-xs font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="text-2xs text-text-tertiary mt-0.5 capitalize">{item.kind}</p>
                <MediaArtifactStatus
                  state={artifactState}
                  mediaKind={item.kind}
                  hasSourcePreview={sourcePreviewAvailability[item.id] === true}
                />
              </div>
            </li>
          ) : (
            <li
              key={item.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5',
                'text-text-primary hover:bg-surface-hover text-xs',
              )}
              title={String(item.locator)}
            >
              <MediaItemPreview
                item={item}
                state={artifactState}
                source={resolveMediaSource(
                  artifactState?.kind === 'ready' ? artifactState.artifact.locator : item.locator,
                )}
                layout="list"
                onSourcePreviewAvailability={onSourcePreviewAvailability}
              />
              <span className="min-w-0 flex-1 truncate">
                {item.name}
                <span className="text-2xs text-text-tertiary block">
                  <span className="capitalize">{item.kind}</span>
                  {' · '}
                  {item.duration === null ? 'Duration unknown' : formatMediaDuration(item.duration)}
                </span>
                <MediaArtifactStatus
                  state={artifactState}
                  mediaKind={item.kind}
                  hasSourcePreview={sourcePreviewAvailability[item.id] === true}
                />
              </span>
              <div className="flex shrink-0 items-center">
                <Button
                  size="icon-sm"
                  variant={mediaPreviewAssetId === item.id ? 'secondary' : 'ghost'}
                  aria-label={`Preview ${item.name}`}
                  aria-pressed={mediaPreviewAssetId === item.id}
                  className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  onClick={() => setMediaPreview(mediaPreviewAssetId === item.id ? null : item.id)}
                  leadingIcon={<Play />}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Add ${item.name} to the timeline`}
                  className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  onClick={() => handleAddToTimeline(item)}
                  leadingIcon={<Plus />}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MediaItemPreview({
  item,
  state,
  source,
  layout,
  onSourcePreviewAvailability,
}: {
  readonly item: MediaItem;
  readonly state: MediaArtifactViewState | undefined;
  readonly source: string;
  readonly layout: 'grid' | 'list';
  readonly onSourcePreviewAvailability: (isAvailable: boolean) => void;
}) {
  const previewClassName =
    layout === 'grid'
      ? 'size-full rounded-none object-cover'
      : 'h-9 w-14 shrink-0 rounded-sm object-cover';
  if (state?.kind === 'ready' && state.artifact.kind === 'thumbnail') {
    return <img src={source} alt="" className={cn('bg-surface-inset', previewClassName)} />;
  }
  if (state?.kind === 'ready' && state.artifact.kind === 'waveform') {
    return (
      <WaveformPreview
        source={source}
        label={`${item.name} waveform`}
        className={previewClassName}
      />
    );
  }
  if (item.kind === 'video') {
    return (
      <SourceVideoThumbnail
        source={source}
        className={previewClassName}
        onFrameAvailabilityChange={onSourcePreviewAvailability}
      />
    );
  }
  const ItemIcon = item.kind === 'audio' ? Music : Video;
  return (
    <span className={cn('bg-surface-inset flex items-center justify-center', previewClassName)}>
      <ItemIcon className="text-text-tertiary size-4" aria-hidden="true" />
    </span>
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

function MediaArtifactStatus({
  state,
  mediaKind,
  hasSourcePreview,
}: {
  readonly state: MediaArtifactViewState | undefined;
  readonly mediaKind: MediaItem['kind'];
  readonly hasSourcePreview: boolean;
}) {
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
      <span
        className={cn(
          'text-2xs block truncate',
          hasSourcePreview ? 'text-text-tertiary' : 'text-danger',
        )}
        title={state.recovery}
      >
        {hasSourcePreview
          ? 'Source preview'
          : mediaKind === 'video'
            ? 'Generated thumbnail unavailable'
            : 'Waveform unavailable'}
      </span>
    );
  }
  return (
    <span className="text-2xs text-text-tertiary block">
      {state.artifact.kind === 'waveform' ? 'Waveform cached' : 'Thumbnail cached'}
    </span>
  );
}

function WaveformPreview({
  source,
  label,
  className,
}: {
  readonly source: string;
  readonly label: string;
  readonly className?: string;
}) {
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
      <span
        className={cn(
          'bg-surface-inset flex h-9 w-14 shrink-0 items-center justify-center rounded-sm',
          className,
        )}
      >
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
      className={cn('bg-surface-inset text-track-audio h-9 w-14 shrink-0 rounded-sm', className)}
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
