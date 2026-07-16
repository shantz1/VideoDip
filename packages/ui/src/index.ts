/**
 * `@videodip/ui` — the VideoDip design system.
 *
 * Consumed by `apps/desktop` and `apps/web`. Only what is re-exported here is
 * public.
 *
 * Styles are not bundled into the JS entry. Import them separately, once per
 * app:
 *
 * ```ts
 * import '@videodip/ui/styles.css';
 * ```
 */

export { Button, buttonVariants, type ButtonProps } from './components/button/button.js';

export { cn } from './lib/cn.js';

export {
  backdrop,
  duration,
  easing,
  fade,
  fadeUp,
  hoverLift,
  modalContent,
  pressable,
  scaleIn,
  slideInLeft,
  slideInRight,
  staggerContainer,
  transitions,
} from './motion/variants.js';
export { useReducedMotion } from './motion/use-reduced-motion.js';

export {
  ThemeProvider,
  themeInitScript,
  useTheme,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemeMode,
  type ThemeProviderProps,
} from './theme/theme-provider.js';
