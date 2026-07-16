'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * Whether the user has asked for reduced motion.
 *
 * `index.css` neutralises CSS transitions globally, but that cannot reach
 * Framer Motion, which animates via JS. Any component driving a Framer
 * animation must consult this and degrade — usually to an instant state change
 * or a plain opacity fade.
 *
 * Reduced motion is an accessibility requirement, not a preference: for users
 * with vestibular disorders, movement can cause genuine nausea. "Subtle" is
 * not a defence.
 *
 * Live-updating via `useSyncExternalStore`, so toggling the OS setting takes
 * effect without a reload. Returns `false` during SSR, where no user preference
 * is knowable; the first client render corrects it.
 *
 * @example
 * ```tsx
 * const reduced = useReducedMotion();
 * <motion.div variants={reduced ? fade : fadeUp} />
 * ```
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
