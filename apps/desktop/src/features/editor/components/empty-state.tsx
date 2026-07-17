'use client';

import { Button, cn } from '@videodip/ui';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  /** Optional call to action. Omit when there is nothing useful to do yet. */
  readonly action?: string;
  readonly onAction?: () => void;
  /** Keeps async empty-state actions focusable while work is in progress. */
  readonly actionLoading?: boolean;
  readonly className?: string;
}

/**
 * The designed empty state.
 *
 * `CLAUDE.md` requires every surface to have one. Blank panels read as broken
 * or still-loading, and they waste the moment when the user is most in need of
 * direction — an empty panel is the best place to explain what it's for.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
  actionLoading = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <div
        className={cn(
          'mb-3 grid size-10 place-items-center rounded-lg',
          'bg-surface-inset text-text-tertiary',
        )}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </div>

      <p className="text-text-primary text-sm font-medium">{title}</p>
      <p className="text-text-tertiary mt-1 max-w-[24ch] text-xs leading-relaxed">{description}</p>

      {action && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          loading={actionLoading}
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </div>
  );
}
