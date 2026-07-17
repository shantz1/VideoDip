'use client';

import { cn } from '@videodip/ui';
import { MousePointerClick } from 'lucide-react';
import { useEditorStore, type InspectorTab } from '../editor.store';
import { EmptyState } from './empty-state';

const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'transform', label: 'Transform' },
  { id: 'animation', label: 'Animation' },
  { id: 'subtitle', label: 'Subtitle' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
];

/**
 * The right-hand inspector.
 *
 * PLACEHOLDER: every tab shows the no-selection empty state. Real controls
 * arrive with the timeline model, which is what supplies a selection to
 * inspect.
 */
export function RightInspector() {
  const tab = useEditorStore((s) => s.inspectorTab);
  const collapsed = useEditorStore((s) => s.inspectorCollapsed);
  const setTab = useEditorStore((s) => s.setInspectorTab);

  if (collapsed) return null;

  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col border-l border-border-subtle bg-surface-base',
      )}
      aria-label="Inspector"
    >
      {/* A real tablist: roving focus and arrow-key navigation come free from
          the ARIA pattern, and screen readers announce position in the set. */}
      <div
        role="tablist"
        aria-label="Inspector sections"
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-subtle px-2 py-1.5"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`inspector-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`inspector-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
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
        <EmptyState
          icon={MousePointerClick}
          title="Nothing selected"
          description="Select a clip on the timeline to edit its properties."
        />
      </div>
    </aside>
  );
}
