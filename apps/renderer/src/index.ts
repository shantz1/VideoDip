/**
 * `@videodip/renderer` — the one Remotion composition VideoDip renders.
 *
 * Consumed two ways: `apps/desktop` imports this directly for
 * `@remotion/player`'s interactive preview; `pnpm --filter @videodip/renderer
 * render` drives the same component headlessly for export. Only what is
 * re-exported here is public.
 */
export { VideoDipComposition, type CompositionClip, type VideoDipCompositionProps } from './composition.js';
