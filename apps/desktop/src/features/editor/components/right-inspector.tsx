'use client';

import { ms, normalized, type TrackId } from '@videodip/shared';
import {
  CORE_TRANSITION_KINDS,
  DEFAULT_CLIP_TRANSFORM,
  getSelectedClipId,
  getSelectedTransitionId,
  type Clip,
  type ClipAnimationProperty,
  type ClipBlendMode,
  type ClipKeyframe,
  type ClipKeyframeEasing,
  type ClipTransform,
  type ClipTransition,
  type CoreTransitionKind,
} from '@videodip/timeline';
import { Button, cn } from '@videodip/ui';
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  Circle,
  Layers,
  Moon,
  MousePointerClick,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  ZoomIn as ZoomInIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useEditorStore, type InspectorTab } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { EmptyState } from './empty-state';
import { SubtitleEditor } from './subtitle-editor';

const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'transform', label: 'Transform' },
  { id: 'animation', label: 'Animation' },
  { id: 'subtitle', label: 'Subtitle' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
];

export interface RightInspectorProps {
  /** Fill the workspace column instead of using the compact legacy width. */
  readonly fillAvailableWidth?: boolean;
}

/** The selected clip inspector and its module-specific extension surfaces. */
export function RightInspector({ fillAvailableWidth = false }: RightInspectorProps = {}) {
  const tab = useEditorStore((state) => state.inspectorTab);
  const collapsed = useEditorStore((state) => state.inspectorCollapsed);
  const setTab = useEditorStore((state) => state.setInspectorTab);
  const selectedClipId = useSessionStore((state) => getSelectedClipId(state.session));
  const selectedTransitionId = useSessionStore((state) => getSelectedTransitionId(state.session));
  const timelineDocument = useProjectStore((state) => state.document);
  const selectedClip = selectedClipId
    ? timelineDocument.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId)
    : undefined;
  const selectedTransition = selectedTransitionId
    ? timelineDocument.transitions.find((transition) => transition.id === selectedTransitionId)
    : undefined;
  const selectedClipTrack = selectedClip
    ? timelineDocument.tracks.find((track) => track.id === selectedClip.trackId)
    : undefined;
  const selectedTransitionTrack = selectedTransition
    ? timelineDocument.tracks.find((track) => track.id === selectedTransition.trackId)
    : undefined;
  const subtitleTrack = timelineDocument.tracks.find((track) => track.kind === 'subtitle');
  const isEditingLocked =
    (tab === 'subtitle' && subtitleTrack?.isLocked === true) ||
    (tab === 'effects' && selectedTransitionTrack?.isLocked === true) ||
    (tab !== 'subtitle' && tab !== 'effects' && selectedClipTrack?.isLocked === true);

  if (collapsed) return null;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.id);
    document.getElementById(`inspector-tab-${next.id}`)?.focus();
  };

  return (
    <aside
      className={cn(
        'border-border-subtle bg-surface-base flex h-full shrink-0 flex-col border-l',
        fillAvailableWidth ? 'w-full' : 'w-72',
      )}
      aria-label="Inspector"
    >
      <div
        role="tablist"
        aria-label="Inspector sections"
        className="border-border-subtle flex shrink-0 gap-0.5 overflow-x-auto border-b px-2 py-1.5"
      >
        {TABS.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`inspector-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`inspector-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={cn(
              'shrink-0 rounded-sm px-2 py-1 text-xs whitespace-nowrap',
              'transition-colors duration-(--duration-fast)',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
              'focus-visible:outline-(--color-border-focus)',
              tab === id
                ? 'bg-surface-inset text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`inspector-panel-${tab}`}
        aria-labelledby={`inspector-tab-${tab}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto"
      >
        {isEditingLocked && (
          <p
            role="status"
            className="bg-surface-inset text-text-secondary m-2 rounded-md px-2 py-1.5 text-xs"
          >
            This track is locked. Unlock it in the timeline to edit its contents.
          </p>
        )}
        <fieldset disabled={isEditingLocked} className="contents">
          {tab === 'subtitle' ? (
            <SubtitleEditor />
          ) : tab === 'effects' && selectedTransition ? (
            <TransitionControls transition={selectedTransition} />
          ) : !selectedClip ? (
            <EmptyState
              icon={MousePointerClick}
              title="Nothing selected"
              description="Select a clip on the timeline to edit its properties."
            />
          ) : tab === 'properties' ? (
            <ClipProperties clip={selectedClip} />
          ) : tab === 'transform' ? (
            <ClipTransformControls clip={selectedClip} />
          ) : tab === 'animation' ? (
            <ClipAnimationControls clip={selectedClip} />
          ) : tab === 'audio' ? (
            <ClipAudioControls clip={selectedClip} />
          ) : (
            <EmptyState
              icon={SlidersHorizontal}
              title={`${TABS.find((item) => item.id === tab)?.label ?? 'Module'} controls`}
              description="This module has no editable parameters for the selected clip yet."
            />
          )}
        </fieldset>
      </div>
    </aside>
  );
}

const TRANSITION_LABELS: Readonly<Record<CoreTransitionKind, string>> = {
  crossfade: 'Crossfade',
  'dip-to-black': 'Dip to black',
  'dip-to-white': 'Dip to white',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'wipe-left': 'Wipe left',
  'wipe-right': 'Wipe right',
  'wipe-up': 'Wipe up',
  'wipe-down': 'Wipe down',
  'zoom-in': 'Zoom in',
  'circle-open': 'Circle open',
  'diagonal-top-left': 'Diagonal (top-left)',
  'diagonal-bottom-right': 'Diagonal (bottom-right)',
};

/** One glyph per built-in transition — arrows/chevrons echo direction, single vs double stroke tells slide from wipe apart at a glance. */
const TRANSITION_ICONS: Readonly<Record<CoreTransitionKind, LucideIcon>> = {
  crossfade: Layers,
  'dip-to-black': Moon,
  'dip-to-white': Sun,
  'slide-left': ArrowLeft,
  'slide-right': ArrowRight,
  'slide-up': ArrowUp,
  'slide-down': ArrowDown,
  'wipe-left': ChevronsLeft,
  'wipe-right': ChevronsRight,
  'wipe-up': ChevronsUp,
  'wipe-down': ChevronsDown,
  'zoom-in': ZoomInIcon,
  'circle-open': Circle,
  'diagonal-top-left': ArrowUpLeft,
  'diagonal-bottom-right': ArrowDownRight,
};

/**
 * A visual grid of transition styles — clicking a cell applies it
 * immediately, matching the pick-a-look UX of Filmora/CapCut's transition
 * browser instead of a plain `<select>`. An unrecognized (plugin) kind gets
 * its own cell so it stays visible and selectable even though it has no
 * icon/label in the built-in map.
 */
function TransitionStyleGrid({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (kind: string) => void;
}) {
  const isPluginKind = !CORE_TRANSITION_KINDS.some((kind) => kind === value);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Transition style">
      {isPluginKind && (
        <TransitionStyleCell
          label={value}
          Icon={Sparkles}
          selected
          onClick={() => onChange(value)}
        />
      )}
      {CORE_TRANSITION_KINDS.map((kind) => (
        <TransitionStyleCell
          key={kind}
          label={TRANSITION_LABELS[kind]}
          Icon={TRANSITION_ICONS[kind]}
          selected={kind === value}
          onClick={() => onChange(kind)}
        />
      ))}
    </div>
  );
}

function TransitionStyleCell({
  label,
  Icon,
  selected,
  onClick,
}: {
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly selected: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={label}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center',
        'transition-colors duration-(--duration-fast)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
        selected
          ? 'border-accent bg-accent-subtle text-accent'
          : 'border-border-subtle bg-surface-raised text-text-secondary hover:border-border-default hover:bg-surface-hover',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="text-2xs truncate leading-tight">{label}</span>
    </button>
  );
}

function TransitionControls({ transition }: { readonly transition: ClipTransition }) {
  const document = useProjectStore((state) => state.document);
  const updateTransition = useProjectStore((state) => state.updateTransition);
  const removeTransition = useProjectStore((state) => state.removeTransition);
  const clearSelection = useSessionStore((state) => state.clearSelection);
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const [error, setError] = useState<string | null>(null);
  const clips = document.tracks.flatMap((track) => track.clips);
  const from = clips.find((clip) => clip.id === transition.fromClipId);
  const to = clips.find((clip) => clip.id === transition.toClipId);
  const fromName = mediaItems.find((item) => item.id === from?.assetId)?.name ?? 'First clip';
  const toName = mediaItems.find((item) => item.id === to?.assetId)?.name ?? 'Second clip';
  const maximumDuration = Math.min(from?.duration ?? 0, to?.duration ?? 0);

  const apply = (patch: Parameters<typeof updateTransition>[1]) => {
    const result = updateTransition(transition.id, patch);
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-2">
        <span className="bg-accent-subtle text-accent grid size-8 shrink-0 place-items-center rounded-md">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-text-primary text-sm font-medium">Clip transition</p>
          <p className="text-text-tertiary truncate text-xs" title={`${fromName} → ${toName}`}>
            {fromName} → {toName}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}

      <InspectorField label="Style">
        <TransitionStyleGrid value={transition.kind} onChange={(kind) => apply({ kind })} />
      </InspectorField>

      <InspectorField label="Duration" suffix="s">
        <SliderControl
          label="Transition duration"
          value={transition.duration / 1000}
          min={Math.min(0.05, maximumDuration / 1000)}
          max={maximumDuration / 1000}
          step={0.05}
          precision={2}
          onCommit={(seconds) => apply({ duration: ms(Math.round(seconds * 1000)) })}
        />
      </InspectorField>

      <p className="text-text-tertiary text-xs">
        The transition is stored on this cut and follows undo, autosave, preview, and export.
      </p>

      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Trash2 />}
        onClick={() => {
          removeTransition(transition.id);
          clearSelection();
        }}
      >
        Remove transition
      </Button>
    </div>
  );
}

function ClipProperties({ clip }: { clip: Clip }) {
  const mediaItems = useEditorStore((state) => state.mediaItems);
  const moveClip = useProjectStore((state) => state.moveClip);
  const trimClip = useProjectStore((state) => state.trimClip);
  const [error, setError] = useState<string | null>(null);
  const media = mediaItems.find((item) => item.id === clip.assetId);
  const tracks = useProjectStore((state) => state.document.tracks);

  const applyStart = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const result = moveClip(clip.id, ms(Math.round(seconds * 1000)));
    setError(result.ok ? null : result.error.recovery);
  };

  const applyDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const end = ms(clip.start + Math.round(seconds * 1000));
    const result = trimClip(clip.id, 'end', end);
    setError(result.ok ? null : result.error.recovery);
  };

  const applyTrack = (trackId: TrackId) => {
    const result = moveClip(clip.id, clip.start, trackId);
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-text-primary truncate text-sm font-medium">
          {media?.name ?? 'Missing media'}
        </p>
        <p className="text-text-tertiary mt-0.5 text-xs capitalize">
          {media?.kind ?? 'unknown'} clip
        </p>
      </div>

      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}

      <InspectorField label="Track">
        <select
          value={clip.trackId}
          onChange={(event) => applyTrack(event.target.value as TrackId)}
          className={controlClassName}
        >
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </InspectorField>

      <InspectorField label="Start" suffix="s">
        <input
          key={`${clip.id}-start-${clip.start}`}
          type="number"
          min="0"
          step="0.01"
          defaultValue={(clip.start / 1000).toFixed(2)}
          onBlur={(event) => applyStart(event.currentTarget.valueAsNumber)}
          className={controlClassName}
        />
      </InspectorField>

      <InspectorField label="Duration" suffix="s">
        <input
          key={`${clip.id}-duration-${clip.duration}`}
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={(clip.duration / 1000).toFixed(2)}
          onBlur={(event) => applyDuration(event.currentTarget.valueAsNumber)}
          className={controlClassName}
        />
      </InspectorField>

      <InspectorField label="Source in" suffix="s">
        <output className="text-text-secondary font-mono text-xs tabular-nums">
          {(clip.sourceStart / 1000).toFixed(2)}
        </output>
      </InspectorField>
    </div>
  );
}

function ClipTransformControls({ clip }: { clip: Clip }) {
  const updateClipProperties = useProjectStore((state) => state.updateClipProperties);
  const [error, setError] = useState<string | null>(null);

  const applyTransform = (property: keyof ClipTransform, value: number) => {
    if (!Number.isFinite(value)) return;
    const normalizedValue =
      property === 'positionX' || property === 'positionY' ? value / 100 : value;
    const result = updateClipProperties(clip.id, {
      transform: { [property]: normalizedValue },
    });
    setError(result.ok ? null : result.error.recovery);
  };

  const applyOpacity = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    const result = updateClipProperties(clip.id, { opacity: normalized(value / 100) });
    setError(result.ok ? null : result.error.recovery);
  };

  const applyBlendMode = (blendMode: ClipBlendMode) => {
    const result = updateClipProperties(clip.id, { blendMode });
    setError(result.ok ? null : result.error.recovery);
  };

  const reset = () => {
    const result = updateClipProperties(clip.id, {
      transform: DEFAULT_CLIP_TRANSFORM,
      opacity: normalized(1),
      blendMode: 'normal',
      isEnabled: true,
    });
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}

      <TransformNumberField
        property="positionX"
        label="Position X"
        suffix="%"
        min={-200}
        max={200}
        step={1}
        displayValue={clip.transform.positionX * 100}
        onApply={applyTransform}
      />
      <TransformNumberField
        property="positionY"
        label="Position Y"
        suffix="%"
        min={-200}
        max={200}
        step={1}
        displayValue={clip.transform.positionY * 100}
        onApply={applyTransform}
      />
      <TransformNumberField
        property="scaleX"
        label="Scale X"
        suffix="×"
        min={0.01}
        max={4}
        step={0.01}
        displayValue={clip.transform.scaleX}
        onApply={applyTransform}
      />
      <TransformNumberField
        property="scaleY"
        label="Scale Y"
        suffix="×"
        min={0.01}
        max={4}
        step={0.01}
        displayValue={clip.transform.scaleY}
        onApply={applyTransform}
      />
      <TransformNumberField
        property="rotation"
        label="Rotation"
        suffix="°"
        min={-180}
        max={180}
        step={1}
        displayValue={clip.transform.rotation}
        onApply={applyTransform}
      />
      <InspectorField label="Opacity" suffix="%">
        <SliderControl
          label="Opacity"
          value={Math.round(clip.opacity * 100)}
          min={0}
          max={100}
          step={1}
          precision={0}
          onCommit={applyOpacity}
        />
      </InspectorField>
      <InspectorField label="Blend">
        <select
          value={clip.blendMode}
          onChange={(event) => applyBlendMode(event.target.value as ClipBlendMode)}
          className={controlClassName}
        >
          {(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const).map(
            (mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ),
          )}
        </select>
      </InspectorField>
      <label className="text-text-tertiary flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={clip.isEnabled}
          onChange={(event) => {
            const result = updateClipProperties(clip.id, { isEnabled: event.target.checked });
            setError(result.ok ? null : result.error.recovery);
          }}
        />
        Enabled in preview and export
      </label>
      <Button size="xs" variant="secondary" onClick={reset}>
        Reset transform
      </Button>
    </div>
  );
}

function TransformNumberField({
  property,
  label,
  suffix,
  displayValue,
  min,
  max,
  step,
  onApply,
}: {
  readonly property: keyof ClipTransform;
  readonly label: string;
  readonly suffix: string;
  readonly displayValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onApply: (property: keyof ClipTransform, value: number) => void;
}) {
  return (
    <InspectorField label={label} suffix={suffix}>
      <SliderControl
        label={label}
        value={displayValue}
        min={min}
        max={max}
        step={step}
        precision={step < 1 ? 2 : 0}
        onCommit={(value) => onApply(property, value)}
      />
    </InspectorField>
  );
}

const ANIMATION_PROPERTIES: readonly ClipAnimationProperty[] = [
  'positionX',
  'positionY',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
];

const ANIMATION_RANGES: Readonly<
  Record<
    ClipAnimationProperty,
    {
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly precision: number;
    }
  >
> = {
  positionX: { min: -2, max: 2, step: 0.01, precision: 2 },
  positionY: { min: -2, max: 2, step: 0.01, precision: 2 },
  scaleX: { min: 0.01, max: 4, step: 0.01, precision: 2 },
  scaleY: { min: 0.01, max: 4, step: 0.01, precision: 2 },
  rotation: { min: -180, max: 180, step: 1, precision: 0 },
  opacity: { min: 0, max: 1, step: 0.01, precision: 2 },
};

function getClipAnimationValue(clip: Clip, property: ClipAnimationProperty): number {
  return property === 'opacity' ? clip.opacity : clip.transform[property];
}

/** One clip-relative keyframe pair (start -> end) for a single property. */
type PresetKeyframePair = readonly [start: number, end: number];

interface ClipAnimationPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * `entrance` presets animate over the first ~500ms (or the whole clip if
   * shorter) — a one-time "in" motion. Continuous presets animate across the
   * clip's full duration — an ambient effect for as long as it's on screen.
   */
  readonly span: 'entrance' | 'full';
  /** Values are relative to the clip's *current* static value — 0 means "no change". */
  readonly deltas: Partial<
    Record<'positionX' | 'positionY' | 'scaleX' | 'scaleY', PresetKeyframePair>
  >;
  readonly easing: ClipKeyframeEasing;
}

/**
 * Preset clip motion library — the "Ken Burns"/pan continuous effects and
 * "slide/pop" one-time entrances every mainstream short-form editor ships,
 * built on the existing keyframe model rather than a parallel animation
 * system. Presets only ever replace keyframes on the properties they touch
 * (see `applyPresetKeyframes`), so a Zoom preset and a Slide-in preset (or
 * the existing Fade in/out opacity buttons) compose freely.
 */
const CLIP_ANIMATION_PRESETS: readonly ClipAnimationPreset[] = [
  {
    id: 'zoom-in',
    name: 'Zoom In',
    description: 'Slow continuous zoom in across the whole clip (Ken Burns).',
    span: 'full',
    deltas: { scaleX: [0, 0.15], scaleY: [0, 0.15] },
    easing: 'linear',
  },
  {
    id: 'zoom-out',
    name: 'Zoom Out',
    description: 'Slow continuous zoom out across the whole clip (Ken Burns).',
    span: 'full',
    deltas: { scaleX: [0.15, 0], scaleY: [0.15, 0] },
    easing: 'linear',
  },
  {
    id: 'pan-left-right',
    name: 'Pan Left to Right',
    description: 'Gentle horizontal drift across the whole clip.',
    span: 'full',
    deltas: { positionX: [-0.06, 0.06] },
    easing: 'linear',
  },
  {
    id: 'pan-right-left',
    name: 'Pan Right to Left',
    description: 'Gentle horizontal drift, reversed.',
    span: 'full',
    deltas: { positionX: [0.06, -0.06] },
    easing: 'linear',
  },
  {
    id: 'pop-in',
    name: 'Pop In',
    description: 'Scales up from slightly smaller as the clip begins.',
    span: 'entrance',
    deltas: { scaleX: [-0.15, 0], scaleY: [-0.15, 0] },
    easing: 'ease-out',
  },
  {
    id: 'slide-in-left',
    name: 'Slide In from Left',
    description: 'Enters from off-screen left, settling into place.',
    span: 'entrance',
    deltas: { positionX: [-0.35, 0] },
    easing: 'ease-out',
  },
  {
    id: 'slide-in-right',
    name: 'Slide In from Right',
    description: 'Enters from off-screen right, settling into place.',
    span: 'entrance',
    deltas: { positionX: [0.35, 0] },
    easing: 'ease-out',
  },
];

function buildPresetKeyframes(
  clip: Clip,
  preset: ClipAnimationPreset,
): {
  readonly touchedProperties: readonly ClipAnimationProperty[];
  readonly keyframes: readonly ClipKeyframe[];
} {
  const startOffset = ms(0);
  const endOffset = preset.span === 'entrance' ? ms(Math.min(500, clip.duration)) : clip.duration;
  const touchedProperties = Object.keys(preset.deltas) as readonly ClipAnimationProperty[];
  const keyframes = touchedProperties.flatMap((property): ClipKeyframe[] => {
    const delta = preset.deltas[property as keyof ClipAnimationPreset['deltas']];
    if (!delta) return [];
    const base = getClipAnimationValue(clip, property);
    const [startDelta, endDelta] = delta;
    return [
      { property, offset: startOffset, value: base + startDelta, easing: preset.easing },
      { property, offset: endOffset, value: base + endDelta, easing: preset.easing },
    ];
  });
  return { touchedProperties, keyframes };
}

/** Replaces keyframes only on the properties a preset touches; everything else is kept. */
function applyPresetKeyframes(
  existing: readonly ClipKeyframe[],
  touchedProperties: readonly ClipAnimationProperty[],
  keyframes: readonly ClipKeyframe[],
): readonly ClipKeyframe[] {
  return [
    ...existing.filter((keyframe) => !touchedProperties.includes(keyframe.property)),
    ...keyframes,
  ];
}

function ClipAnimationControls({ clip }: { readonly clip: Clip }) {
  const setClipAnimation = useProjectStore((state) => state.setClipAnimation);
  const [property, setProperty] = useState<ClipAnimationProperty>('opacity');
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [value, setValue] = useState(1);
  const [easing, setEasing] = useState<ClipKeyframeEasing>('linear');
  const [error, setError] = useState<string | null>(null);
  const valueRange = ANIMATION_RANGES[property];

  const apply = (animation: Clip['animation']) => {
    const result = setClipAnimation(clip.id, animation);
    setError(result.ok ? null : result.error.recovery);
  };

  const addKeyframe = () => {
    if (!Number.isFinite(offsetSeconds) || !Number.isFinite(value)) return;
    const offset = ms(Math.round(offsetSeconds * 1000));
    apply([
      ...clip.animation.filter(
        (keyframe) => keyframe.property !== property || keyframe.offset !== offset,
      ),
      { property, offset, value, easing },
    ]);
  };

  const addFade = (direction: 'in' | 'out') => {
    const edge = ms(Math.min(500, clip.duration));
    const startValue = direction === 'in' ? 0 : clip.opacity;
    const endValue = direction === 'in' ? clip.opacity : 0;
    const startOffset = direction === 'in' ? ms(0) : ms(clip.duration - edge);
    const endOffset = direction === 'in' ? edge : clip.duration;
    apply([
      ...clip.animation.filter((keyframe) => keyframe.property !== 'opacity'),
      { property: 'opacity', offset: startOffset, value: startValue, easing: 'linear' },
      { property: 'opacity', offset: endOffset, value: endValue, easing: 'ease-in-out' },
    ]);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-text-tertiary text-xs">
        Offsets are relative to this clip. Position values use frame fractions; opacity uses 0–1.
      </p>
      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="xs" variant="secondary" onClick={() => addFade('in')}>
          Fade in
        </Button>
        <Button size="xs" variant="secondary" onClick={() => addFade('out')}>
          Fade out
        </Button>
      </div>
      <div>
        <p className="text-text-tertiary mb-1.5 text-xs font-medium">Motion presets</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CLIP_ANIMATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              aria-label={`${preset.name} (${preset.span === 'entrance' ? 'entrance' : 'continuous'})`}
              onClick={() => {
                const { touchedProperties, keyframes } = buildPresetKeyframes(clip, preset);
                apply(applyPresetKeyframes(clip.animation, touchedProperties, keyframes));
              }}
              className={cn(
                'border-border-subtle bg-surface-raised rounded-md border px-2 py-1.5 text-left text-xs',
                'hover:bg-surface-hover hover:border-border-default transition-colors duration-(--duration-fast)',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-border-focus)',
              )}
            >
              <span className="text-text-primary block font-medium">{preset.name}</span>
              <span className="text-text-tertiary text-2xs mt-0.5 block">
                {preset.span === 'entrance' ? 'Entrance' : 'Continuous'}
              </span>
            </button>
          ))}
        </div>
      </div>
      <InspectorField label="Property">
        <select
          value={property}
          onChange={(event) => {
            const nextProperty = event.target.value as ClipAnimationProperty;
            setProperty(nextProperty);
            setValue(getClipAnimationValue(clip, nextProperty));
          }}
          className={controlClassName}
        >
          {ANIMATION_PROPERTIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </InspectorField>
      <InspectorField label="Offset" suffix="s">
        <SliderControl
          label="Keyframe offset"
          value={offsetSeconds}
          min={0}
          max={clip.duration / 1000}
          step={0.01}
          precision={2}
          onCommit={setOffsetSeconds}
        />
      </InspectorField>
      <InspectorField label="Value">
        <SliderControl
          label={`${property} keyframe value`}
          value={value}
          min={valueRange.min}
          max={valueRange.max}
          step={valueRange.step}
          precision={valueRange.precision}
          onCommit={setValue}
        />
      </InspectorField>
      <InspectorField label="Easing">
        <select
          value={easing}
          onChange={(event) => setEasing(event.target.value as ClipKeyframeEasing)}
          className={controlClassName}
        >
          {(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </InspectorField>
      <Button size="xs" variant="primary" onClick={addKeyframe}>
        Add or replace keyframe
      </Button>

      {clip.animation.length === 0 ? (
        <p className="text-text-tertiary py-3 text-center text-xs">No keyframes yet.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Clip keyframes">
          {clip.animation.map((keyframe) => (
            <li
              key={`${keyframe.property}-${keyframe.offset}`}
              className="bg-surface-inset flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <span className="text-text-secondary min-w-0 flex-1 truncate">
                {keyframe.property} · {(keyframe.offset / 1000).toFixed(2)}s · {keyframe.value}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${keyframe.property} keyframe at ${keyframe.offset / 1000} seconds`}
                onClick={() => apply(clip.animation.filter((item) => item !== keyframe))}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      {clip.animation.length > 0 && (
        <Button size="xs" variant="ghost" onClick={() => apply([])}>
          Clear animation
        </Button>
      )}
    </div>
  );
}

function ClipAudioControls({ clip }: { readonly clip: Clip }) {
  const updateClipAudio = useProjectStore((state) => state.updateClipAudio);
  const [error, setError] = useState<string | null>(null);

  const apply = (patch: Parameters<typeof updateClipAudio>[1]) => {
    const result = updateClipAudio(clip.id, patch);
    setError(result.ok ? null : result.error.recovery);
  };

  const applyFade = (edge: 'fadeIn' | 'fadeOut', seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    apply({ [edge]: ms(Math.round(seconds * 1000)) });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}
      <InspectorField label="Volume" suffix="%">
        <SliderControl
          label="Volume"
          value={Math.round(clip.audio.volume * 100)}
          min={0}
          max={100}
          step={1}
          precision={0}
          onCommit={(value) => apply({ volume: normalized(value / 100) })}
        />
      </InspectorField>
      <InspectorField label="Fade in" suffix="s">
        <SliderControl
          label="Audio fade in"
          value={clip.audio.fadeIn / 1000}
          min={0}
          max={clip.duration / 1000}
          step={0.01}
          precision={2}
          onCommit={(seconds) => applyFade('fadeIn', seconds)}
        />
      </InspectorField>
      <InspectorField label="Fade out" suffix="s">
        <SliderControl
          label="Audio fade out"
          value={clip.audio.fadeOut / 1000}
          min={0}
          max={clip.duration / 1000}
          step={0.01}
          precision={2}
          onCommit={(seconds) => applyFade('fadeOut', seconds)}
        />
      </InspectorField>
      <label className="text-text-tertiary flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={clip.audio.isMuted}
          onChange={(event) => apply({ isMuted: event.target.checked })}
        />
        Mute this clip
      </label>
      <Button
        size="xs"
        variant="secondary"
        onClick={() =>
          apply({ volume: normalized(1), isMuted: false, fadeIn: ms(0), fadeOut: ms(0) })
        }
      >
        Reset audio
      </Button>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  precision,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly precision: number;
  readonly onCommit: (value: number) => void;
}) {
  const clamp = (candidate: number) => Math.min(max, Math.max(min, candidate));
  const [draft, setDraft] = useState(() => clamp(value));

  useEffect(() => setDraft(Math.min(max, Math.max(min, value))), [max, min, value]);

  const commit = () => {
    const next = Number(clamp(draft).toFixed(precision));
    setDraft(next);
    if (next !== Number(clamp(value).toFixed(precision))) onCommit(next);
  };

  return (
    <span className="grid min-w-0 grid-cols-[minmax(4rem,1fr)_3.25rem] items-center gap-2">
      <input
        type="range"
        aria-label={`${label} slider`}
        aria-valuetext={draft.toFixed(precision)}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          ) {
            commit();
          }
        }}
        onBlur={commit}
        className="accent-accent min-w-0 cursor-pointer"
      />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={draft.toFixed(precision)}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={commit}
        className={cn(controlClassName, 'w-full px-1 text-right font-mono tabular-nums')}
      />
    </span>
  );
}

const controlClassName = cn(
  'h-7 min-w-0 rounded-md border border-border-default bg-surface-inset px-2',
  'text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
);

function InspectorField({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <label className="text-text-tertiary grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs">
      <span>{label}</span>
      {children}
      {suffix && <span>{suffix}</span>}
    </label>
  );
}
