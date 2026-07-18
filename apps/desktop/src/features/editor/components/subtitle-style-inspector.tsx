'use client';

import {
  resolveSubtitleStyle,
  type SubtitleSegment,
  type SubtitleStyle,
} from '@videodip/subtitle-engine';
import { normalized } from '@videodip/shared';
import { Button, cn } from '@videodip/ui';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  RotateCcw,
  Underline,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSubtitleStore } from '../subtitle.store';

/** A font source that can later be supplied by plugins or project embedding. */
export interface SubtitleFontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly source: 'system' | 'project' | 'plugin';
}

/** Offline-safe fonts available without downloading or embedding assets. */
export const DEFAULT_SUBTITLE_FONTS: readonly SubtitleFontOption[] = [
  { id: 'sans-serif', label: 'Sans Serif', family: 'sans-serif', source: 'system' },
  { id: 'serif', label: 'Serif', family: 'serif', source: 'system' },
  { id: 'monospace', label: 'Monospace', family: 'monospace', source: 'system' },
  { id: 'system-ui', label: 'System UI', family: 'system-ui', source: 'system' },
];

const RECENT_FONTS_KEY = 'videodip.subtitle.recent-fonts';

/** Compact professional styling controls for one subtitle cue. */
export function SubtitleStyleInspector({
  cue,
  onError,
  fontOptions = DEFAULT_SUBTITLE_FONTS,
}: {
  readonly cue: SubtitleSegment;
  readonly onError: (message: string | null) => void;
  /** Injected catalog for future embedded, downloaded, and plugin fonts. */
  readonly fontOptions?: readonly SubtitleFontOption[];
}) {
  const documentStyle = useSubtitleStore((state) => state.document.defaultStyle);
  const preview = useSubtitleStore((state) => state.stylePreviews[cue.id]);
  const update = useSubtitleStore((state) => state.update);
  const previewStyle = useSubtitleStore((state) => state.previewStyle);
  const commitStylePreview = useSubtitleStore((state) => state.commitStylePreview);
  const cancelStylePreview = useSubtitleStore((state) => state.cancelStylePreview);
  const style = useMemo(
    () => resolveSubtitleStyle(documentStyle, cue.style, preview),
    [cue.style, documentStyle, preview],
  );

  const patch = (stylePatch: Partial<SubtitleStyle>) => {
    const result = update(cue.id, { style: stylePatch });
    onError(result.ok ? null : result.error.recovery);
  };
  const previewColor = (stylePatch: Partial<SubtitleStyle>) => previewStyle(cue.id, stylePatch);
  const commitColor = () => {
    const result = commitStylePreview(cue.id);
    onError(result.ok ? null : result.error.recovery);
  };

  return (
    <div className="flex flex-col gap-2">
      <InspectorSection title="Typography" defaultOpen>
        <FontPicker
          value={style.fontFamily}
          options={fontOptions}
          onChange={(fontFamily) => patch({ fontFamily })}
        />
        <ControlRow label="Size">
          <CommitSlider
            label="Font size"
            value={style.fontSize}
            min={8}
            max={180}
            step={1}
            onCommit={(fontSize) => patch({ fontSize })}
          />
        </ControlRow>
        <ControlRow label="Weight">
          <select
            value={style.fontWeight}
            onChange={(event) => patch({ fontWeight: Number(event.currentTarget.value) })}
            className={controlClassName}
          >
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </ControlRow>
        <div className="grid grid-cols-3 gap-1">
          <ToggleButton
            label="Bold"
            active={style.fontWeight >= 700}
            icon={<Bold />}
            onClick={() => patch({ fontWeight: style.fontWeight >= 700 ? 400 : 700 })}
          />
          <ToggleButton
            label="Italic"
            active={style.isItalic}
            icon={<Italic />}
            onClick={() => patch({ isItalic: !style.isItalic })}
          />
          <ToggleButton
            label="Underline"
            active={style.isUnderlined}
            icon={<Underline />}
            onClick={() => patch({ isUnderlined: !style.isUnderlined })}
          />
        </div>
        <ControlRow label="Tracking">
          <CommitSlider
            label="Letter spacing"
            value={style.letterSpacing}
            min={-5}
            max={30}
            step={0.1}
            precision={1}
            onCommit={(letterSpacing) => patch({ letterSpacing })}
          />
        </ControlRow>
        <ControlRow label="Leading">
          <CommitSlider
            label="Line height"
            value={style.lineHeight}
            min={0.7}
            max={3}
            step={0.05}
            precision={2}
            onCommit={(lineHeight) => patch({ lineHeight })}
          />
        </ControlRow>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Caption alignment">
          {(
            [
              ['start', 'Align left', <AlignLeft key="left" />],
              ['center', 'Align center', <AlignCenter key="center" />],
              ['end', 'Align right', <AlignRight key="right" />],
            ] as const
          ).map(([alignment, label, icon]) => (
            <ToggleButton
              key={alignment}
              label={label}
              active={style.alignment === alignment}
              icon={icon}
              onClick={() => patch({ alignment })}
            />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="Appearance" defaultOpen>
        <ColorRow
          label="Text"
          value={style.foreground}
          onPreview={(foreground) => previewColor({ foreground })}
          onCommit={commitColor}
          onCancel={() => cancelStylePreview(cue.id)}
        />
        <ControlRow label="Opacity">
          <CommitSlider
            label="Text opacity"
            value={style.opacity * 100}
            min={0}
            max={100}
            step={1}
            onCommit={(opacity) => patch({ opacity: normalized(opacity / 100) })}
          />
        </ControlRow>
      </InspectorSection>

      <InspectorSection title="Background" defaultOpen>
        <label className="text-text-secondary flex items-center justify-between text-xs">
          Enable background
          <input
            type="checkbox"
            checked={style.backgroundEnabled}
            onChange={(event) => patch({ backgroundEnabled: event.currentTarget.checked })}
          />
        </label>
        <ColorRow
          label="Color"
          value={style.background}
          disabled={!style.backgroundEnabled}
          onPreview={(background) => previewColor({ background })}
          onCommit={commitColor}
          onCancel={() => cancelStylePreview(cue.id)}
        />
        <ControlRow label="Opacity">
          <CommitSlider
            label="Background opacity"
            value={style.backgroundOpacity * 100}
            min={0}
            max={100}
            step={1}
            disabled={!style.backgroundEnabled}
            onCommit={(backgroundOpacity) =>
              patch({ backgroundOpacity: normalized(backgroundOpacity / 100) })
            }
          />
        </ControlRow>
        <ControlRow label="Padding">
          <CommitSlider
            label="Background padding"
            value={style.padding}
            min={0}
            max={80}
            step={1}
            onCommit={(padding) => patch({ padding })}
          />
        </ControlRow>
        <ControlRow label="Radius">
          <CommitSlider
            label="Background radius"
            value={style.borderRadius}
            min={0}
            max={80}
            step={1}
            onCommit={(borderRadius) => patch({ borderRadius })}
          />
        </ControlRow>
      </InspectorSection>

      <InspectorSection title="Stroke">
        <ColorRow
          label="Color"
          value={style.strokeColor}
          onPreview={(strokeColor) => previewColor({ strokeColor })}
          onCommit={commitColor}
          onCancel={() => cancelStylePreview(cue.id)}
        />
        <ControlRow label="Width">
          <CommitSlider
            label="Stroke width"
            value={style.strokeWidth}
            min={0}
            max={20}
            step={0.25}
            precision={2}
            onCommit={(strokeWidth) => patch({ strokeWidth })}
          />
        </ControlRow>
      </InspectorSection>

      <InspectorSection title="Shadow">
        <ColorRow
          label="Color"
          value={style.shadowColor}
          onPreview={(shadowColor) => previewColor({ shadowColor })}
          onCommit={commitColor}
          onCancel={() => cancelStylePreview(cue.id)}
        />
        <ControlRow label="Opacity">
          <CommitSlider
            label="Shadow opacity"
            value={style.shadowOpacity * 100}
            min={0}
            max={100}
            step={1}
            onCommit={(shadowOpacity) => patch({ shadowOpacity: normalized(shadowOpacity / 100) })}
          />
        </ControlRow>
        <ControlRow label="Blur">
          <CommitSlider
            label="Shadow blur"
            value={style.shadowBlur}
            min={0}
            max={80}
            step={1}
            onCommit={(shadowBlur) => patch({ shadowBlur })}
          />
        </ControlRow>
        <ControlRow label="Offset X">
          <CommitSlider
            label="Shadow horizontal offset"
            value={style.shadowOffsetX}
            min={-50}
            max={50}
            step={1}
            onCommit={(shadowOffsetX) => patch({ shadowOffsetX })}
          />
        </ControlRow>
        <ControlRow label="Offset Y">
          <CommitSlider
            label="Shadow vertical offset"
            value={style.shadowOffsetY}
            min={-50}
            max={50}
            step={1}
            onCommit={(shadowOffsetY) => patch({ shadowOffsetY })}
          />
        </ControlRow>
      </InspectorSection>

      <InspectorSection title="Transform" defaultOpen>
        <ControlRow label="Position X">
          <CommitSlider
            label="Subtitle position X"
            value={style.positionX * 100}
            min={0}
            max={100}
            step={0.1}
            precision={1}
            onCommit={(positionX) => patch({ positionX: normalized(positionX / 100) })}
          />
        </ControlRow>
        <ControlRow label="Position Y">
          <CommitSlider
            label="Subtitle position Y"
            value={style.positionY * 100}
            min={0}
            max={100}
            step={0.1}
            precision={1}
            onCommit={(positionY) => patch({ positionY: normalized(positionY / 100) })}
          />
        </ControlRow>
        <ControlRow label="Rotation">
          <CommitSlider
            label="Subtitle rotation"
            value={style.rotation}
            min={-180}
            max={180}
            step={1}
            onCommit={(rotation) => patch({ rotation })}
          />
        </ControlRow>
        <ControlRow label="Scale">
          <CommitSlider
            label="Subtitle scale"
            value={style.scale * 100}
            min={10}
            max={400}
            step={1}
            onCommit={(scale) => patch({ scale: scale / 100 })}
          />
        </ControlRow>
        <ControlRow label="Max width">
          <CommitSlider
            label="Subtitle maximum width"
            value={style.maxWidth * 100}
            min={10}
            max={100}
            step={1}
            onCommit={(maxWidth) => patch({ maxWidth: normalized(maxWidth / 100) })}
          />
        </ControlRow>
        <Button
          size="xs"
          variant="secondary"
          leadingIcon={<RotateCcw />}
          onClick={() =>
            patch({ positionX: documentStyle.positionX, positionY: documentStyle.positionY })
          }
        >
          Reset position
        </Button>
      </InspectorSection>

      <InspectorSection title="Animation">
        <ControlRow label="Entrance">
          <select
            value={style.animation}
            onChange={(event) =>
              patch({ animation: event.currentTarget.value as SubtitleStyle['animation'] })
            }
            className={controlClassName}
          >
            <option value="none">Still</option>
            <option value="fade">Fade</option>
            <option value="pop">Pop</option>
            <option value="slide-up">Slide up</option>
          </select>
        </ControlRow>
      </InspectorSection>
    </div>
  );
}

function FontPicker({
  value,
  options: availableOptions,
  onChange,
}: {
  readonly value: string;
  readonly options: readonly SubtitleFontOption[];
  readonly onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_FONTS_KEY) ?? '[]') as unknown;
      if (Array.isArray(parsed))
        setRecent(parsed.filter((item): item is string => typeof item === 'string').slice(0, 5));
    } catch {
      setRecent([]);
    }
  }, []);

  const options = useMemo(() => {
    const recentOptions = recent.map(
      (family) =>
        availableOptions.find((font) => font.family === family) ?? {
          id: `recent:${family}`,
          label: family,
          family,
          source: 'system' as const,
        },
    );
    return [...recentOptions, ...availableOptions.filter((font) => !recent.includes(font.family))];
  }, [availableOptions, recent]);

  const choose = (family: string) => {
    const next = [family, ...recent.filter((item) => item !== family)].slice(0, 5);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next));
    } catch {
      // Font choice still works when preference storage is unavailable.
    }
    onChange(family);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(controlClassName, 'w-full text-left')}
        style={{ fontFamily: value }}
      >
        {options.find((font) => font.family === value)?.label ?? value}
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="Subtitle font"
          className="border-border-default bg-surface-raised absolute top-8 right-0 left-0 z-20 max-h-48 overflow-y-auto rounded-md border p-1 shadow-lg"
        >
          {options.map((font) => (
            <button
              key={font.id}
              type="button"
              role="option"
              aria-selected={font.family === value}
              onClick={() => choose(font.family)}
              className={cn(
                'hover:bg-surface-hover text-text-primary w-full rounded-sm px-2 py-1.5 text-left text-xs',
                font.family === value && 'bg-surface-inset',
              )}
              style={{ fontFamily: font.family }}
            >
              <span className="block truncate">{font.label}</span>
              <span className="text-text-tertiary block truncate">Aa Caption preview</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Controlled native color input with a single explicit commit boundary. */
export function SubtitleColorInput({
  label,
  value,
  disabled = false,
  onPreview,
  onCommit,
  onCancel,
}: {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onPreview: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => toNativeColor(value));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(toNativeColor(value)), [value]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // React deliberately maps `onChange` to the browser's high-frequency
    // `input` event for color controls. The native `change` event is the real
    // picker-dismissal boundary and therefore the one undo commit point.
    const commitNativeChange = () => {
      const next = input.value;
      setDraft(next);
      onPreview(next);
      onCommit();
    };
    input.addEventListener('change', commitNativeChange);
    return () => input.removeEventListener('change', commitNativeChange);
  }, [onCommit, onPreview]);

  return (
    <input
      ref={inputRef}
      aria-label={label}
      type="color"
      value={draft}
      disabled={disabled}
      onInput={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        onPreview(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(toNativeColor(value));
          onCancel();
        }
      }}
      className={cn(controlClassName, 'w-full cursor-pointer p-0.5')}
    />
  );
}

function ColorRow(
  props: Omit<Parameters<typeof SubtitleColorInput>[0], 'label'> & { readonly label: string },
) {
  return (
    <ControlRow label={props.label}>
      <SubtitleColorInput {...props} label={`${props.label} color`} />
    </ControlRow>
  );
}

function toNativeColor(value: string): string {
  return /^#[\da-f]{6}$/i.test(value) ? value : '#000000';
}

function InspectorSection({
  title,
  defaultOpen = false,
  children,
}: {
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="border-border-subtle rounded-md border">
      <summary className="text-text-secondary hover:bg-surface-hover cursor-pointer px-2.5 py-2 text-xs font-medium">
        {title}
      </summary>
      <div className="border-border-subtle flex flex-col gap-2.5 border-t p-2.5">{children}</div>
    </details>
  );
}

function ToggleButton({
  label,
  active,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      leadingIcon={icon}
    />
  );
}

function ControlRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="text-text-tertiary grid grid-cols-[4.75rem_1fr] items-center gap-2 text-xs">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CommitSlider({
  label,
  value,
  min,
  max,
  step,
  precision = 0,
  disabled = false,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly precision?: number;
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
}) {
  const clamp = (candidate: number) => Math.min(max, Math.max(min, candidate));
  const [draft, setDraft] = useState(() => clamp(value));
  useEffect(() => setDraft(clamp(value)), [value, min, max]);

  const commit = () => {
    const next = Number(clamp(draft).toFixed(precision));
    setDraft(next);
    if (next !== Number(clamp(value).toFixed(precision))) onCommit(next);
  };

  return (
    <span className="grid min-w-0 grid-cols-[1fr_3rem] items-center gap-1.5">
      <input
        type="range"
        aria-label={`${label} slider`}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="accent-accent min-w-0"
      />
      <input
        type="number"
        aria-label={`${label} value`}
        value={draft.toFixed(precision)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          if (Number.isFinite(event.currentTarget.valueAsNumber))
            setDraft(event.currentTarget.valueAsNumber);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={cn(controlClassName, 'w-full px-1 text-right font-mono tabular-nums')}
      />
    </span>
  );
}

const controlClassName = cn(
  'h-7 min-w-0 rounded-md border border-border-default bg-surface-inset px-2',
  'text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-(--color-border-focus)',
  'disabled:cursor-not-allowed disabled:opacity-50',
);
