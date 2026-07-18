import type { MediaKind } from '@videodip/shared';
import { AbsoluteFill, Audio, Sequence, Video, useCurrentFrame } from 'remotion';
import { z } from 'zod';

const positiveInteger = z.number().int().positive();

const compositionTransitionSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).max(128),
  durationInFrames: positiveInteger,
  parameters: z.record(
    z.string().min(1).max(128),
    z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  ),
});

export const compositionClipSchema = z.object({
  id: z.string().min(1),
  trackKind: z.string().min(1),
  mediaKind: z.enum(['video', 'audio']),
  src: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: positiveInteger,
  sourceStartFrame: z.number().int().nonnegative(),
  transform: z.object({
    positionX: z.number().finite().min(-10).max(10),
    positionY: z.number().finite().min(-10).max(10),
    scaleX: z.number().finite().positive().max(100),
    scaleY: z.number().finite().positive().max(100),
    rotation: z.number().finite().min(-36_000).max(36_000),
  }),
  opacity: z.number().finite().min(0).max(1),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']),
  isEnabled: z.boolean(),
  animation: z
    .array(
      z.object({
        property: z.enum(['positionX', 'positionY', 'scaleX', 'scaleY', 'rotation', 'opacity']),
        frame: z.number().int().nonnegative(),
        value: z.number().finite(),
        easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
      }),
    )
    .readonly(),
  audio: z.object({
    volume: z.number().finite().min(0).max(1),
    isMuted: z.boolean(),
    fadeInFrames: z.number().int().nonnegative(),
    fadeOutFrames: z.number().int().nonnegative(),
  }),
  transitionIn: compositionTransitionSchema.nullable(),
  transitionOut: compositionTransitionSchema.nullable(),
});

export const compositionSettingsSchema = z.object({
  fps: positiveInteger,
  width: positiveInteger,
  height: positiveInteger,
  durationInFrames: positiveInteger,
});

export const compositionSubtitleSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: positiveInteger,
  text: z.string().min(1).max(10_000),
  words: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        startFrame: z.number().int().nonnegative(),
        endFrame: positiveInteger,
      }),
    )
    .readonly(),
  style: z.object({
    fontFamily: z.string().min(1).nullable(),
    fontSize: z.number().finite().positive().nullable(),
    foreground: z.string().min(1).nullable(),
    background: z.string().min(1).nullable(),
    isBold: z.boolean(),
    isItalic: z.boolean(),
    isUnderlined: z.boolean(),
    alignment: z.enum(['start', 'center', 'end']),
    positionX: z.number().finite().min(0).max(1),
    positionY: z.number().finite().min(0).max(1),
    animation: z.enum(['none', 'fade', 'pop', 'slide-up']),
  }),
});

export const videoDipCompositionSchema = z.object({
  clips: z.array(compositionClipSchema).readonly(),
  subtitles: z.array(compositionSubtitleSchema).readonly(),
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
  readonly transform: {
    readonly positionX: number;
    readonly positionY: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly rotation: number;
  };
  readonly opacity: number;
  readonly blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
  readonly isEnabled: boolean;
  readonly animation: readonly CompositionKeyframe[];
  readonly audio: {
    readonly volume: number;
    readonly isMuted: boolean;
    readonly fadeInFrames: number;
    readonly fadeOutFrames: number;
  };
  /** Transition entering this clip from its adjacent predecessor. */
  readonly transitionIn: CompositionTransition | null;
  /** Transition leaving this clip for its adjacent successor. */
  readonly transitionOut: CompositionTransition | null;
}

/** Serializable transition relation resolved onto both composition endpoints. */
export interface CompositionTransition {
  readonly id: string;
  readonly kind: string;
  readonly durationInFrames: number;
  readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
}

/** Frame-based keyframe consumed by the headless-safe composition boundary. */
export interface CompositionKeyframe {
  readonly property: 'positionX' | 'positionY' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
  readonly frame: number;
  readonly value: number;
  readonly easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface CompositionSettings {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
}

/** Fully resolved caption cue consumed by preview and headless rendering. */
export interface CompositionSubtitle {
  readonly id: string;
  readonly startFrame: number;
  readonly durationInFrames: number;
  readonly text: string;
  readonly words: readonly {
    readonly id: string;
    readonly text: string;
    readonly startFrame: number;
    readonly endFrame: number;
  }[];
  readonly style: {
    readonly fontFamily: string | null;
    readonly fontSize: number | null;
    readonly foreground: string | null;
    readonly background: string | null;
    readonly isBold: boolean;
    readonly isItalic: boolean;
    readonly isUnderlined: boolean;
    readonly alignment: 'start' | 'center' | 'end';
    readonly positionX: number;
    readonly positionY: number;
    readonly animation: 'none' | 'fade' | 'pop' | 'slide-up';
  };
}

/**
 * A `type`, not an `interface`, deliberately: Remotion's `<Composition>`
 * constrains props to `Record<string, unknown>`, which only type aliases
 * satisfy (they get an implicit index signature; interfaces don't).
 */
export type VideoDipCompositionProps = {
  readonly clips: readonly CompositionClip[];
  readonly subtitles: readonly CompositionSubtitle[];
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
export function VideoDipComposition({ clips, subtitles }: VideoDipCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {clips
        .filter((clip) => clip.isEnabled)
        .map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationInFrames + (clip.transitionOut?.durationInFrames ?? 0)}
          >
            <RenderedClip clip={clip} />
          </Sequence>
        ))}
      {subtitles.map((subtitle) => (
        <Sequence
          key={subtitle.id}
          from={subtitle.startFrame}
          durationInFrames={subtitle.durationInFrames}
        >
          <RenderedSubtitle subtitle={subtitle} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

const DEFAULT_CAPTION_FOREGROUND = '#ffffff';
const DEFAULT_CAPTION_BACKGROUND = 'rgba(0, 0, 0, 0.72)';

function RenderedSubtitle({ subtitle }: { readonly subtitle: CompositionSubtitle }) {
  const frame = useCurrentFrame();
  const textAlign = subtitle.style.alignment;
  const entrance = Math.min(1, frame / 6);
  const animatedOpacity = subtitle.style.animation === 'none' ? 1 : entrance;
  const animatedScale = subtitle.style.animation === 'pop' ? 0.8 + entrance * 0.2 : 1;
  const animatedY = subtitle.style.animation === 'slide-up' ? (1 - entrance) * 24 : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${subtitle.style.positionX * 100}%`,
        top: `${subtitle.style.positionY * 100}%`,
        width: '90%',
        transform: `translate(-50%, calc(-50% + ${animatedY}px)) scale(${animatedScale})`,
        opacity: animatedOpacity,
        textAlign,
        fontFamily: subtitle.style.fontFamily ?? 'sans-serif',
        fontSize: subtitle.style.fontSize ?? 48,
        fontWeight: subtitle.style.isBold ? 700 : 400,
        fontStyle: subtitle.style.isItalic ? 'italic' : 'normal',
        textDecoration: subtitle.style.isUnderlined ? 'underline' : 'none',
        color: subtitle.style.foreground ?? DEFAULT_CAPTION_FOREGROUND,
        whiteSpace: 'pre-wrap',
      }}
    >
      <span
        style={{
          backgroundColor: subtitle.style.background ?? DEFAULT_CAPTION_BACKGROUND,
          boxDecorationBreak: 'clone',
          padding: '0.12em 0.3em',
          borderRadius: '0.15em',
        }}
      >
        {subtitle.words.length === 0
          ? subtitle.text
          : subtitle.words.map((word, index) => (
              <span
                key={word.id}
                style={{ opacity: frame >= word.startFrame && frame < word.endFrame ? 1 : 0.72 }}
              >
                {index > 0 ? ' ' : ''}
                {word.text}
              </span>
            ))}
      </span>
    </div>
  );
}

function RenderedClip({ clip }: { readonly clip: CompositionClip }) {
  const frame = useCurrentFrame();
  if (clip.mediaKind === 'audio') {
    return (
      <Audio
        src={clip.src}
        startFrom={clip.sourceStartFrame}
        volume={(audioFrame) => audioVolume(clip, audioFrame)}
      />
    );
  }
  const positionX = animatedValue(clip, 'positionX', frame, clip.transform.positionX);
  const positionY = animatedValue(clip, 'positionY', frame, clip.transform.positionY);
  const scaleX = animatedValue(clip, 'scaleX', frame, clip.transform.scaleX);
  const scaleY = animatedValue(clip, 'scaleY', frame, clip.transform.scaleY);
  const rotation = animatedValue(clip, 'rotation', frame, clip.transform.rotation);
  const opacity = animatedValue(clip, 'opacity', frame, clip.opacity);
  const transition = transitionVisualState(clip, frame);
  return (
    <Video
      src={clip.src}
      startFrom={clip.sourceStartFrame}
      style={{
        height: '100%',
        width: '100%',
        objectFit: 'contain',
        opacity: opacity * transition.opacity,
        mixBlendMode: clip.blendMode,
        clipPath: transition.clipPath,
        transform: `translate(${positionX * 100}%, ${positionY * 100}%) translateX(${transition.translateX}%) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
      }}
    />
  );
}

function audioVolume(clip: CompositionClip, frame: number): number {
  if (clip.audio.isMuted) return 0;
  const fadeIn = clip.audio.fadeInFrames > 0 ? Math.min(1, frame / clip.audio.fadeInFrames) : 1;
  const remaining = Math.max(0, clip.durationInFrames - frame);
  const fadeOut =
    clip.audio.fadeOutFrames > 0 ? Math.min(1, remaining / clip.audio.fadeOutFrames) : 1;
  return clip.audio.volume * Math.min(fadeIn, fadeOut) * transitionAudioFactor(clip, frame);
}

interface TransitionVisualState {
  readonly opacity: number;
  readonly translateX: number;
  readonly clipPath: string | undefined;
}

function transitionVisualState(clip: CompositionClip, frame: number): TransitionVisualState {
  let opacity = 1;
  let translateX = 0;
  let clipPath: string | undefined;
  const incoming = clip.transitionIn;
  if (incoming) {
    const progress = clamp01(frame / incoming.durationInFrames);
    if (incoming.kind === 'dip-to-black') opacity *= clamp01((progress - 0.5) * 2);
    else if (!isDirectionalTransition(incoming.kind)) opacity *= progress;
    if (incoming.kind === 'slide-left') translateX += (1 - progress) * 100;
    if (incoming.kind === 'slide-right') translateX -= (1 - progress) * 100;
    if (incoming.kind === 'wipe-left') clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
    if (incoming.kind === 'wipe-right') clipPath = `inset(0 0 0 ${(1 - progress) * 100}%)`;
  }

  const outgoing = clip.transitionOut;
  if (outgoing) {
    const startsAt = clip.durationInFrames;
    const progress = clamp01((frame - startsAt) / outgoing.durationInFrames);
    if (outgoing.kind === 'dip-to-black') opacity *= 1 - clamp01(progress * 2);
    else if (!isDirectionalTransition(outgoing.kind)) opacity *= 1 - progress;
    if (outgoing.kind === 'slide-left') translateX -= progress * 100;
    if (outgoing.kind === 'slide-right') translateX += progress * 100;
  }
  return { opacity, translateX, clipPath };
}

function transitionAudioFactor(clip: CompositionClip, frame: number): number {
  let factor = 1;
  if (clip.transitionIn) {
    factor *= clamp01(frame / clip.transitionIn.durationInFrames);
  }
  if (clip.transitionOut) {
    const startsAt = clip.durationInFrames;
    factor *= 1 - clamp01((frame - startsAt) / clip.transitionOut.durationInFrames);
  }
  return factor;
}

function isDirectionalTransition(kind: string): boolean {
  return (
    kind === 'slide-left' || kind === 'slide-right' || kind === 'wipe-left' || kind === 'wipe-right'
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function animatedValue(
  clip: CompositionClip,
  property: CompositionKeyframe['property'],
  frame: number,
  fallback: number,
): number {
  const keyframes = clip.animation.filter((keyframe) => keyframe.property === property);
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (!first || !last) return fallback;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  for (let index = 1; index < keyframes.length; index += 1) {
    const left = keyframes[index - 1];
    const right = keyframes[index];
    if (!left || !right || frame > right.frame) continue;
    const progress = (frame - left.frame) / (right.frame - left.frame);
    return left.value + (right.value - left.value) * eased(progress, right.easing);
  }
  return last.value;
}

function eased(progress: number, easing: CompositionKeyframe['easing']): number {
  if (easing === 'ease-in') return progress * progress;
  if (easing === 'ease-out') return 1 - (1 - progress) * (1 - progress);
  if (easing === 'ease-in-out') {
    return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
  }
  return progress;
}
