'use client';

import { buttonVariants, cn } from '@videodip/ui';
import { Check, ChevronDown, Monitor, Smartphone, Square } from 'lucide-react';
import { useMemo, type ComponentType } from 'react';
import type { Shortcut } from '../../shortcuts/shortcut.types';
import { useShortcuts } from '../../shortcuts/use-shortcuts';
import { useEditorStore, type AspectRatio } from '../editor.store';

interface CanvasLayout {
  readonly ratio: AspectRatio;
  readonly label: string;
  readonly description: string;
  readonly icon: ComponentType<{ readonly className?: string; readonly 'aria-hidden'?: boolean }>;
}

const REEL_LAYOUT: CanvasLayout = {
  ratio: '9:16',
  label: 'Reel / Short',
  description: 'Portrait video · 9:16',
  icon: Smartphone,
};

const CANVAS_LAYOUTS: readonly CanvasLayout[] = [
  REEL_LAYOUT,
  {
    ratio: '16:9',
    label: 'Horizontal video',
    description: 'YouTube and widescreen · 16:9',
    icon: Monitor,
  },
  {
    ratio: '4:5',
    label: 'Social portrait',
    description: 'Feed post · 4:5',
    icon: Smartphone,
  },
  {
    ratio: '3:4',
    label: 'Classic portrait',
    description: 'Portrait video · 3:4',
    icon: Square,
  },
];

/** Visible Filmora-style project canvas switcher shared by preview and export. */
export function CanvasLayoutSelector() {
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const setAspectRatio = useEditorStore((state) => state.setAspectRatio);
  const active = CANVAS_LAYOUTS.find((layout) => layout.ratio === aspectRatio) ?? REEL_LAYOUT;
  const ActiveIcon = active.icon;

  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      {
        id: 'canvas.toggleOrientation',
        label: 'Toggle portrait / horizontal canvas',
        scope: 'view',
        combo: { key: 'r', mod: true, shift: true },
        run: () => setAspectRatio(aspectRatio === '16:9' ? '9:16' : '16:9'),
      },
    ],
    [aspectRatio, setAspectRatio],
  );
  useShortcuts(shortcuts);

  return (
    <details className="group relative">
      <summary
        aria-label={`Canvas layout: ${active.label} ${active.ratio}`}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'cursor-pointer list-none gap-1 font-normal [&::-webkit-details-marker]:hidden',
        )}
      >
        <ActiveIcon className="size-3.5" aria-hidden />
        <span className="hidden xl:inline">{active.label}</span>
        <span className="text-text-tertiary">{active.ratio}</span>
        <ChevronDown
          className="size-3 transition-transform duration-[--duration-fast] group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div
        role="menu"
        aria-label="Canvas layouts"
        className="border-border-default bg-surface-overlay absolute top-full right-0 z-[--z-dropdown] mt-1 w-64 rounded-md border p-1 shadow-lg"
      >
        <p className="text-text-tertiary px-2 py-1.5 text-xs">Project canvas</p>
        {CANVAS_LAYOUTS.map((layout) => {
          const Icon = layout.icon;
          const isActive = layout.ratio === aspectRatio;
          return (
            <button
              key={layout.ratio}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              onClick={(event) => {
                setAspectRatio(layout.ratio);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className={cn(
                'hover:bg-surface-hover grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-sm px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-[--color-border-focus]',
                isActive ? 'bg-surface-selected' : '',
              )}
            >
              <Icon className="text-text-secondary size-4" aria-hidden />
              <span>
                <span className="text-text-primary block text-xs font-medium">{layout.label}</span>
                <span className="text-text-tertiary block text-[0.625rem]">
                  {layout.description}
                </span>
              </span>
              {isActive && <Check className="text-accent size-3.5" aria-hidden />}
            </button>
          );
        })}
        <p className="text-text-tertiary border-border-subtle border-t px-2 py-1.5 text-[0.625rem]">
          Ctrl+Shift+R toggles portrait and horizontal.
        </p>
      </div>
    </details>
  );
}
