import type { AspectRatio } from '../editor.store';

/** Delivery-sized composition geometry shared by preview rendering and overlays. */
export const COMPOSITION_SIZE: Readonly<
  Record<AspectRatio, { readonly width: number; readonly height: number }>
> = {
  '9:16': { width: 1080, height: 1920 },
  '3:4': { width: 1080, height: 1440 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};
