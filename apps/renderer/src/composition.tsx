import { AbsoluteFill, Audio, Sequence, Video } from 'remotion';

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
  readonly kind: 'video' | 'audio' | 'subtitle';
  readonly src: string;
  /** Frame this clip begins at on the overall timeline. */
  readonly startFrame: number;
  readonly durationInFrames: number;
  /** Frame offset into the source media where this clip's content begins. */
  readonly sourceStartFrame: number;
}

/**
 * A `type`, not an `interface`, deliberately: Remotion's `<Composition>`
 * constrains props to `Record<string, unknown>`, which only type aliases
 * satisfy (they get an implicit index signature; interfaces don't).
 */
export type VideoDipCompositionProps = {
  readonly clips: readonly CompositionClip[];
};

/**
 * The one composition VideoDip renders, whether driven by `@remotion/player`
 * for interactive preview (`apps/desktop`) or `@remotion/renderer` for
 * headless export (`apps/worker`, eventually). Sharing this exact component
 * between the two is the reason `apps/renderer` exists as its own workspace
 * rather than living inside `apps/desktop` — a preview that can silently
 * drift from what actually exports is a worse bug than a missing feature.
 *
 * No subtitle rendering yet — `packages/subtitle-engine` doesn't exist. A
 * `kind: 'subtitle'` clip is accepted (so the type doesn't need revisiting
 * when it lands) but renders nothing today.
 */
export function VideoDipComposition({ clips }: VideoDipCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {clips.map((clip) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationInFrames}>
          {clip.kind === 'audio' ? (
            <Audio src={clip.src} startFrom={clip.sourceStartFrame} />
          ) : clip.kind === 'video' ? (
            <Video src={clip.src} startFrom={clip.sourceStartFrame} />
          ) : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
