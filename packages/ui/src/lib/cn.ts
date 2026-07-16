import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, resolving Tailwind conflicts in favour of the last value.
 *
 * `clsx` handles conditionals; `twMerge` resolves collisions. Without the
 * merge step, `cn('p-2', 'p-4')` emits both and the winner depends on CSS
 * source order rather than call order — so a caller's override of a
 * component's default silently does nothing. That is the entire reason every
 * component funnels its `className` through here.
 *
 * @example
 * ```ts
 * cn('px-2 py-1', isActive && 'bg-accent', className)
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
