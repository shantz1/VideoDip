/**
 * Reusable Framer Motion variants and transitions.
 *
 * `CLAUDE.md`: "Every animation is reusable." Inline one-off transitions are
 * how an app ends up with fourteen slightly different fade durations that
 * nobody can reconcile. Compose from this file; if something here doesn't fit,
 * add a named variant rather than inlining at the call site.
 *
 * These mirror the duration and easing tokens in `tokens.css`. The values are
 * duplicated in seconds because Framer animates in JS and cannot read CSS
 * custom properties — keep the two in sync when either changes.
 *
 * Reduced motion: CSS transitions are neutralised globally in `index.css`, but
 * that does not reach Framer's JS-driven animations. Components using these
 * variants must gate them with {@link useReducedMotion} from this package.
 */

import type { Transition, Variants } from 'framer-motion';

/** Durations in seconds, mirroring the `--duration-*` tokens. */
export const duration = {
  instant: 0.05,
  fast: 0.12,
  normal: 0.2,
  slow: 0.32,
  slower: 0.5,
} as const;

/** Easing curves, mirroring the `--ease-*` tokens. */
export const easing = {
  outQuad: [0.25, 0.46, 0.45, 0.94],
  /** The "expensive software" curve: fast out, long tail. Use for entrances. */
  outExpo: [0.16, 1, 0.3, 1],
  inOutQuad: [0.45, 0, 0.55, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;

/** Standard transitions. Prefer these over ad-hoc `transition` objects. */
export const transitions = {
  /** UI state changes: hover, press, toggle. */
  snappy: { duration: duration.fast, ease: easing.outQuad },
  /** Default for entrances and exits. */
  smooth: { duration: duration.normal, ease: easing.outExpo },
  /** Larger surfaces: modals, panels. */
  gentle: { duration: duration.slow, ease: easing.outExpo },
  /**
   * Physical spring for drag release — timeline clips, reordering.
   * Spring rather than duration-based because the user's gesture has velocity,
   * and a fixed duration ignoring it feels detached from the input.
   */
  springy: { type: 'spring', stiffness: 400, damping: 30, mass: 0.8 },
} as const satisfies Record<string, Transition>;

/** Fade only. The safe default when in doubt. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.smooth },
  exit: { opacity: 0, transition: transitions.snappy },
};

/**
 * Fade with a short upward travel. The workhorse entrance.
 *
 * 8px, not 24px: large travel reads as a slideshow and costs perceived
 * performance, because the UI isn't usable until it lands.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitions.smooth },
  exit: { opacity: 0, y: 4, transition: transitions.snappy },
};

/** Fade with a subtle scale. For popovers, dropdowns, context menus. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transitions.smooth },
  exit: { opacity: 0, scale: 0.98, transition: transitions.snappy },
};

/** Modal/dialog content. Slightly larger travel than a popover. */
export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transitions.gentle },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transitions.snappy },
};

/** Backdrop behind a modal. Fades faster than its content on exit. */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.smooth },
  exit: { opacity: 0, transition: transitions.snappy },
};

/** Panels sliding in from the right (inspector, properties). */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: transitions.gentle },
  exit: { opacity: 0, x: 16, transition: transitions.snappy },
};

/** Panels sliding in from the left (sidebar). */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: transitions.gentle },
  exit: { opacity: 0, x: -16, transition: transitions.snappy },
};

/**
 * Container that staggers its children.
 *
 * Pair with {@link fadeUp} on each child. Use for lists that appear at once —
 * landing-page feature grids, media library on load.
 *
 * @param stagger - Delay between children, in seconds.
 * @param delay - Delay before the first child.
 */
export const staggerContainer = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
});

/**
 * Press feedback. Attach as `whileTap`.
 *
 * Scale is the only affordance available on a trackpad, and its absence is
 * what makes web UI feel unresponsive next to native.
 */
export const pressable = {
  whileTap: { scale: 0.97, transition: transitions.snappy },
} as const;

/** Hover lift for cards. Attach as `whileHover`. */
export const hoverLift = {
  whileHover: { y: -2, transition: transitions.snappy },
} as const;
