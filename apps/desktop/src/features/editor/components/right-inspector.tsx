'use client';

import { ms, type TrackId } from '@videodip/shared';
import type { Clip } from '@videodip/timeline';
import { cn } from '@videodip/ui';
import { MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useEditorStore, type InspectorTab } from '../editor.store';
import { useProjectStore } from '../project.store';
import { EmptyState } from './empty-state';

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
      className="flex w-72 shrink-0 flex-col border-l border-border-subtle bg-surface-base"
      aria-label="Inspector"
    >
      <div
        role="tablist"
        aria-label="Inspector sections"
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-subtle px-2 py-1.5"
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
        {!selectedClip ? (
          <EmptyState
            icon={MousePointerClick}
            title="Nothing selected"
            description="Select a clip on the timeline to edit its properties."
          />
        ) : tab === 'properties' ? (
          <ClipProperties clip={selectedClip} />
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
        <p className="truncate text-sm font-medium text-text-primary">
          {media?.name ?? 'Missing media'}
        </p>
        <p className="mt-0.5 text-xs capitalize text-text-tertiary">
          {media?.kind ?? 'unknown'} clip
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <InspectorField label="Track">
        <select
          value={clip.trackId}
          onChange={(event) => applyTrack(event.target.value as TrackId)}
          className={controlClassName}
        >
          <option value="subtitle">Subtitles</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
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
        <output className="font-mono text-xs tabular-nums text-text-secondary">
          {(clip.sourceStart / 1000).toFixed(2)}
        </output>
      </InspectorField>
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
    <label className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs text-text-tertiary">
      <span>{label}</span>
      {children}
      {suffix && <span>{suffix}</span>}
    </label>
  );
}
