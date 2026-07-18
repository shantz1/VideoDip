'use client';

import {
  exportSubtitle,
  parseSubtitle,
  type SubtitleFormat,
  type SubtitleSegment,
  type SubtitleWord,
} from '@videodip/subtitle-engine';
import { ms } from '@videodip/shared';
import { Button, cn } from '@videodip/ui';
import { Captions, FileDown, FileUp, Plus, Scissors, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useEditorStore } from '../editor.store';
import { useSubtitleStore } from '../subtitle.store';
import { SubtitleStyleInspector } from './subtitle-style-inspector';

/** Complete document-level subtitle timing, text, style, and interchange editor. */
export function SubtitleEditor() {
  const document = useSubtitleStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedSubtitleId);
  const select = useSubtitleStore((state) => state.select);
  const add = useSubtitleStore((state) => state.add);
  const replace = useSubtitleStore((state) => state.replace);
  const setLanguage = useSubtitleStore((state) => state.setLanguage);
  const playhead = useEditorStore((state) => state.playhead);
  const seek = useEditorStore((state) => state.seek);
  const selectClip = useEditorStore((state) => state.selectClip);
  const [format, setFormat] = useState<SubtitleFormat>('srt');
  const [interchangeText, setInterchangeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = document.segments.find((segment) => segment.id === selectedId);

  const addCue = () => {
    selectClip(null);
    const start = findFreeCueStart(document.segments, playhead, 2000);
    const result = add({ start: ms(start), end: ms(start + 2000), text: 'New subtitle' });
    setError(result.ok ? null : result.error.recovery);
  };

  const importText = () => {
    const result = parseSubtitle(interchangeText, format, document.language);
    if (result.ok) replace(result.value);
    setError(result.ok ? null : result.error.recovery);
  };

  const generateExport = () => {
    const result = exportSubtitle(document, format);
    if (result.ok) setInterchangeText(result.value);
    setError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Captions className="text-text-secondary size-4" aria-hidden="true" />
        <p className="text-text-primary flex-1 text-sm font-medium">Subtitles</p>
        <Button size="xs" variant="primary" leadingIcon={<Plus />} onClick={addCue}>
          Add cue
        </Button>
      </div>

      {error && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-2 py-1.5 text-xs">
          {error}
        </p>
      )}

      <Field label="Language">
        <input
          key={document.language ?? 'auto'}
          defaultValue={document.language ?? ''}
          placeholder="auto"
          onBlur={(event) => setLanguage(event.currentTarget.value)}
          className={controlClassName}
        />
      </Field>

      <div className="border-border-subtle max-h-48 overflow-y-auto rounded-md border">
        {document.segments.length === 0 ? (
          <p className="text-text-tertiary px-3 py-6 text-center text-xs">
            Add a cue or import subtitle text.
          </p>
        ) : (
          <ul aria-label="Subtitle cues">
            {document.segments.map((segment, index) => (
              <li key={segment.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectClip(null);
                    select(segment.id);
                    seek(segment.start);
                  }}
                  className={cn(
                    'border-border-subtle flex w-full gap-2 border-b px-2 py-2 text-left last:border-b-0',
                    selectedId === segment.id ? 'bg-surface-inset' : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="text-text-tertiary w-5 shrink-0 text-xs">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-text-primary block truncate text-xs">{segment.text}</span>
                    <span className="text-text-tertiary block text-[0.625rem]">
                      {formatTime(segment.start)} – {formatTime(segment.end)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && <SelectedCueEditor cue={selected} onError={setError} />}

      <div className="border-border-subtle flex flex-col gap-2 border-t pt-4">
        <Field label="Format">
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as SubtitleFormat)}
            className={controlClassName}
          >
            <option value="srt">SRT</option>
            <option value="vtt">WebVTT</option>
            <option value="ass">ASS</option>
          </select>
        </Field>
        <textarea
          value={interchangeText}
          onChange={(event) => setInterchangeText(event.target.value)}
          rows={5}
          aria-label="Subtitle interchange text"
          placeholder="Paste subtitle text here to import, or generate text to save."
          className={cn(controlClassName, 'h-auto resize-y py-2 font-mono')}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button size="xs" variant="secondary" leadingIcon={<FileUp />} onClick={importText}>
            Import text
          </Button>
          <Button size="xs" variant="secondary" leadingIcon={<FileDown />} onClick={generateExport}>
            Generate export
          </Button>
        </div>
      </div>
    </div>
  );
}

function SelectedCueEditor({
  cue,
  onError,
}: {
  readonly cue: SubtitleSegment;
  readonly onError: (message: string | null) => void;
}) {
  const update = useSubtitleStore((state) => state.update);
  const remove = useSubtitleStore((state) => state.remove);
  const split = useSubtitleStore((state) => state.split);
  const playhead = useEditorStore((state) => state.playhead);

  const apply = (patch: Partial<Omit<SubtitleSegment, 'id'>>) => {
    const result = update(cue.id, patch);
    onError(result.ok ? null : result.error.recovery);
  };
  const applySeconds = (key: 'start' | 'end', value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    apply({ [key]: ms(Math.round(value * 1000)) });
  };

  return (
    <div className="border-border-subtle flex flex-col gap-3 rounded-md border p-3">
      <textarea
        key={`${cue.id}-${cue.text}`}
        defaultValue={cue.text}
        rows={3}
        aria-label="Subtitle text"
        onBlur={(event) => apply({ text: event.currentTarget.value })}
        className={cn(controlClassName, 'h-auto resize-y py-2')}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start" compact>
          <input
            key={`${cue.id}-start-${cue.start}`}
            type="number"
            min="0"
            step="0.01"
            defaultValue={(cue.start / 1000).toFixed(2)}
            onBlur={(event) => applySeconds('start', event.currentTarget.valueAsNumber)}
            className={controlClassName}
          />
        </Field>
        <Field label="End" compact>
          <input
            key={`${cue.id}-end-${cue.end}`}
            type="number"
            min="0"
            step="0.01"
            defaultValue={(cue.end / 1000).toFixed(2)}
            onBlur={(event) => applySeconds('end', event.currentTarget.valueAsNumber)}
            className={controlClassName}
          />
        </Field>
      </div>
      <SubtitleStyleInspector cue={cue} onError={onError} />
      {cue.words.length > 0 && <WordTimingEditor cue={cue} onApply={apply} />}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="xs"
          variant="secondary"
          leadingIcon={<Scissors />}
          disabled={playhead <= cue.start || playhead >= cue.end}
          onClick={() => {
            const result = split(cue.id, playhead);
            onError(result.ok ? null : result.error.recovery);
          }}
        >
          Split here
        </Button>
        <Button size="xs" variant="ghost" leadingIcon={<Trash2 />} onClick={() => remove(cue.id)}>
          Delete cue
        </Button>
      </div>
    </div>
  );
}

function WordTimingEditor({
  cue,
  onApply,
}: {
  readonly cue: SubtitleSegment;
  readonly onApply: (patch: Partial<Omit<SubtitleSegment, 'id'>>) => void;
}) {
  const updateWord = (id: string, patch: Partial<SubtitleWord>) => {
    onApply({ words: cue.words.map((word) => (word.id === id ? { ...word, ...patch } : word)) });
  };
  return (
    <details>
      <summary className="text-text-secondary cursor-pointer text-xs">
        Word timing ({cue.words.length})
      </summary>
      <div className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
        {cue.words.map((word) => (
          <div key={word.id} className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-1">
            <input
              aria-label={`Word ${word.text}`}
              defaultValue={word.text}
              onBlur={(event) => updateWord(word.id, { text: event.currentTarget.value })}
              className={controlClassName}
            />
            <input
              aria-label={`${word.text} start`}
              type="number"
              step="0.01"
              defaultValue={(word.start / 1000).toFixed(2)}
              onBlur={(event) =>
                updateWord(word.id, { start: ms(event.currentTarget.valueAsNumber * 1000) })
              }
              className={controlClassName}
            />
            <input
              aria-label={`${word.text} end`}
              type="number"
              step="0.01"
              defaultValue={(word.end / 1000).toFixed(2)}
              onBlur={(event) =>
                updateWord(word.id, { end: ms(event.currentTarget.valueAsNumber * 1000) })
              }
              className={controlClassName}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

function findFreeCueStart(
  segments: readonly SubtitleSegment[],
  preferred: number,
  duration: number,
): number {
  let candidate = preferred;
  for (const segment of segments) {
    if (candidate + duration <= segment.start) return candidate;
    if (candidate < segment.end) candidate = segment.end;
  }
  return candidate;
}

function formatTime(value: number): string {
  const minutes = Math.floor(value / 60_000);
  const seconds = (value % 60_000) / 1000;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

const controlClassName = cn(
  'h-7 min-w-0 rounded-md border border-border-default bg-surface-inset px-2',
  'text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
);

function Field({
  label,
  compact = false,
  children,
}: {
  readonly label: string;
  readonly compact?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'text-text-tertiary gap-2 text-xs',
        compact ? 'flex flex-col' : 'grid grid-cols-[4.5rem_1fr] items-center',
      )}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}
