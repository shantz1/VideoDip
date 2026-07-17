import type { MediaKind } from '@videodip/shared';
import { AbsoluteFill, Audio, Sequence, Video } from 'remotion';
import { z } from 'zod';

const positiveInteger = z.number().int().positive();

export const compositionClipSchema = z.object({
  id: z.string().min(1),
  trackKind: z.string().min(1),
  mediaKind: z.enum(['video', 'audio']),
  src: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: positiveInteger,
  sourceStartFrame: z.number().int().nonnegative(),
});

export const compositionSettingsSchema = z.object({
  fps: positiveInteger,
  width: positiveInteger,
  height: positiveInteger,
  durationInFrames: positiveInteger,
});

export const videoDipCompositionSchema = z.object({
  clips: z.array(compositionClipSchema).readonly(),
  settings: compositionSettingsSchema,
});

/**
 * One placed clip, already resolved to a servable source and converted to
 * frames.
 *
 * Deliberately not `@videodip/timeline`'s `Clip` type: that type's `assetId`
 * means nothing to Remotion, and its times are milliseconds, not frames.
 * Resolving an asset id to a real `src` URL is environment-specific — a
 * Tauri `convertFileSrc()` path for the live preview, a plain file path for
 * headless server-side rendering — so that resolution happens in each
 * caller, not here. This type is the boundary: whatever the caller is, by
 * the time a clip reaches this composition it must already be a real,
 * loadable source and a frame number.
 */
export interface CompositionClip {
  readonly id: string;
  /** Open layer metadata. It controls ordering, never media dispatch. */
  readonly trackKind: string;
  /** Asset capability. Arbitrary track kinds can still contain media. */
  readonly mediaKind: MediaKind;
  readonly src: string;
  /** Frame this clip begins at on the overall timeline. */
  readonly startFrame: number;
  readonly durationInFrames: number;
  /** Frame offset into the source media where this clip's content begins. */
  readonly sourceStartFrame: number;
}

export interface CompositionSettings {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
}

/**
 * A `type`, not an `interface`, deliberately: Remotion's `<Composition>`
 * constrains props to `Record<string, unknown>`, which only type aliases
 * satisfy (they get an implicit index signature; interfaces don't).
 */
export type VideoDipCompositionProps = {
  readonly clips: readonly CompositionClip[];
  readonly settings: CompositionSettings;
};

export function getCompositionMetadata({
  settings,
}: VideoDipCompositionProps): CompositionSettings {
  return settings;
}

/**
 * The one composition VideoDip renders, whether driven by `@remotion/player`
 * for interactive preview (`apps/desktop`) or `@remotion/renderer` for
 * headless export (`apps/worker`, eventually). Sharing this exact component
 * between the two is the reason `apps/renderer` exists as its own workspace
 * rather than living inside `apps/desktop` — a preview that can silently
 * drift from what actually exports is a worse bug than a missing feature.
 *
 * Subtitle/effect payloads will extend this serializable boundary once their
 * domain packages exist. Track kinds do not need to change when that happens.
 */
export function VideoDipComposition({ clips }: VideoDipCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {clips.map((clip) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationInFrames}>
          {clip.mediaKind === 'audio' ? (
            <Audio src={clip.src} startFrom={clip.sourceStartFrame} />
          ) : (
            <Video src={clip.src} startFrom={clip.sourceStartFrame} />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
