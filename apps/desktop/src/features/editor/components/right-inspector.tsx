'use client';

import { ms, normalized, type TrackId } from '@videodip/shared';
import {
  DEFAULT_CLIP_TRANSFORM,
  type Clip,
  type ClipAnimationProperty,
  type ClipBlendMode,
  type ClipKeyframeEasing,
  type ClipTransform,
} from '@videodip/timeline';
import { Button, cn } from '@videodip/ui';
import { MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useEditorStore, type InspectorTab } from '../editor.store';
import { useProjectStore } from '../project.store';
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

/** The selected clip inspector and its module-specific extension surfaces. */
export function RightInspector() {
  const tab = useEditorStore((state) => state.inspectorTab);
  const collapsed = useEditorStore((state) => state.inspectorCollapsed);
  const setTab = useEditorStore((state) => state.setInspectorTab);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const timelineDocument = useProjectStore((state) => state.document);
  const selectedClip = selectedClipId
    ? timelineDocument.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId)
    : undefined;

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
      className="border-border-subtle bg-surface-base flex w-72 shrink-0 flex-col border-l"
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
              'transition-colors duration-[--duration-fast]',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
              'focus-visible:outline-[--color-border-focus]',
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
        {tab === 'subtitle' ? (
          <SubtitleEditor />
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
      </div>
    </aside>
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
        clip={clip}
        property="positionX"
        label="Position X"
        suffix="%"
        displayValue={clip.transform.positionX * 100}
        onApply={applyTransform}
      />
      <TransformNumberField
        clip={clip}
        property="positionY"
        label="Position Y"
        suffix="%"
        displayValue={clip.transform.positionY * 100}
        onApply={applyTransform}
      />
      <TransformNumberField
        clip={clip}
        property="scaleX"
        label="Scale X"
        suffix="×"
        min={0.01}
        displayValue={clip.transform.scaleX}
        onApply={applyTransform}
      />
      <TransformNumberField
        clip={clip}
        property="scaleY"
        label="Scale Y"
        suffix="×"
        min={0.01}
        displayValue={clip.transform.scaleY}
        onApply={applyTransform}
      />
      <TransformNumberField
        clip={clip}
        property="rotation"
        label="Rotation"
        suffix="°"
        displayValue={clip.transform.rotation}
        onApply={applyTransform}
      />
      <InspectorField label="Opacity" suffix="%">
        <input
          key={`${clip.id}-opacity-${clip.opacity}`}
          type="number"
          min="0"
          max="100"
          step="1"
          defaultValue={Math.round(clip.opacity * 100)}
          onBlur={(event) => applyOpacity(event.currentTarget.valueAsNumber)}
          className={controlClassName}
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
  clip,
  property,
  label,
  suffix,
  displayValue,
  min,
  onApply,
}: {
  readonly clip: Clip;
  readonly property: keyof ClipTransform;
  readonly label: string;
  readonly suffix: string;
  readonly displayValue: number;
  readonly min?: number;
  readonly onApply: (property: keyof ClipTransform, value: number) => void;
}) {
  return (
    <InspectorField label={label} suffix={suffix}>
      <input
        key={`${clip.id}-${property}-${displayValue}`}
        type="number"
        min={min}
        step="0.01"
        defaultValue={Number(displayValue.toFixed(2))}
        onBlur={(event) => onApply(property, event.currentTarget.valueAsNumber)}
        className={controlClassName}
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

function ClipAnimationControls({ clip }: { readonly clip: Clip }) {
  const setClipAnimation = useProjectStore((state) => state.setClipAnimation);
  const [property, setProperty] = useState<ClipAnimationProperty>('opacity');
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [value, setValue] = useState(1);
  const [easing, setEasing] = useState<ClipKeyframeEasing>('linear');
  const [error, setError] = useState<string | null>(null);

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
      <InspectorField label="Property">
        <select
          value={property}
          onChange={(event) => setProperty(event.target.value as ClipAnimationProperty)}
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
        <input
          type="number"
          min="0"
          max={clip.duration / 1000}
          step="0.01"
          value={offsetSeconds}
          onChange={(event) => setOffsetSeconds(event.currentTarget.valueAsNumber)}
          className={controlClassName}
        />
      </InspectorField>
      <InspectorField label="Value">
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.currentTarget.valueAsNumber)}
          className={controlClassName}
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
        <input
          key={`${clip.id}-volume-${clip.audio.volume}`}
          type="number"
          min="0"
          max="100"
          step="1"
          defaultValue={Math.round(clip.audio.volume * 100)}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (Number.isFinite(value) && value >= 0 && value <= 100) {
              apply({ volume: normalized(value / 100) });
            }
          }}
          className={controlClassName}
        />
      </InspectorField>
      <InspectorField label="Fade in" suffix="s">
        <input
          key={`${clip.id}-fade-in-${clip.audio.fadeIn}`}
          type="number"
          min="0"
          max={clip.duration / 1000}
          step="0.01"
          defaultValue={(clip.audio.fadeIn / 1000).toFixed(2)}
          onBlur={(event) => applyFade('fadeIn', event.currentTarget.valueAsNumber)}
          className={controlClassName}
        />
      </InspectorField>
      <InspectorField label="Fade out" suffix="s">
        <input
          key={`${clip.id}-fade-out-${clip.audio.fadeOut}`}
          type="number"
          min="0"
          max={clip.duration / 1000}
          step="0.01"
          defaultValue={(clip.audio.fadeOut / 1000).toFixed(2)}
          onBlur={(event) => applyFade('fadeOut', event.currentTarget.valueAsNumber)}
          className={controlClassName}
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

const controlClassName = cn(
  'h-7 min-w-0 rounded-md border border-border-default bg-surface-inset px-2',
  'text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-[--color-border-focus]',
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
