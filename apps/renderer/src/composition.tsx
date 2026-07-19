import type { MediaKind } from '@videodip/shared';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion';
import { z } from 'zod';
// Data-URI @font-face declarations for the bundled caption font pack.
// Imported here — not in apps/desktop's global styles alone — because this
// composition is the one component shared by live preview and headless
// export (see the module doc below); a stylesheet imported only by the
// desktop app would never reach the headless Chrome instance render-cli
// drives for export.
import '../assets/caption-fonts.generated.css';

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
    fontFamily: z.string().min(1),
    fontSize: z.number().finite().positive(),
    fontWeight: z.number().int().min(100).max(900),
    isItalic: z.boolean(),
    isUnderlined: z.boolean(),
    letterSpacing: z.number().finite(),
    lineHeight: z.number().finite().positive(),
    foreground: z.string().min(1),
    opacity: z.number().finite().min(0).max(1),
    backgroundEnabled: z.boolean(),
    background: z.string().min(1),
    backgroundOpacity: z.number().finite().min(0).max(1),
    strokeColor: z.string().min(1),
    strokeWidth: z.number().finite().nonnegative(),
    shadowColor: z.string().min(1),
    shadowBlur: z.number().finite().nonnegative(),
    shadowOffsetX: z.number().finite(),
    shadowOffsetY: z.number().finite(),
    shadowOpacity: z.number().finite().min(0).max(1),
    alignment: z.enum(['start', 'center', 'end']),
    maxWidth: z.number().finite().min(0).max(1),
    padding: z.number().finite().nonnegative(),
    borderRadius: z.number().finite().nonnegative(),
    positionX: z.number().finite().min(0).max(1),
    positionY: z.number().finite().min(0).max(1),
    rotation: z.number().finite(),
    scale: z.number().finite().positive(),
    animation: z.enum([
      'none',
      'fade',
      'pop',
      'bounce',
      'slide-up',
      'slide-down',
      'slide-left',
      'slide-right',
    ]),
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
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly fontWeight: number;
    readonly isItalic: boolean;
    readonly isUnderlined: boolean;
    readonly letterSpacing: number;
    readonly lineHeight: number;
    readonly foreground: string;
    readonly opacity: number;
    readonly backgroundEnabled: boolean;
    readonly background: string;
    readonly backgroundOpacity: number;
    readonly strokeColor: string;
    readonly strokeWidth: number;
    readonly shadowColor: string;
    readonly shadowBlur: number;
    readonly shadowOffsetX: number;
    readonly shadowOffsetY: number;
    readonly shadowOpacity: number;
    readonly alignment: 'start' | 'center' | 'end';
    readonly maxWidth: number;
    readonly padding: number;
    readonly borderRadius: number;
    readonly positionX: number;
    readonly positionY: number;
    readonly rotation: number;
    readonly scale: number;
    readonly animation:
      | 'none'
      | 'fade'
      | 'pop'
      | 'bounce'
      | 'slide-up'
      | 'slide-down'
      | 'slide-left'
      | 'slide-right';
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

function RenderedSubtitle({ subtitle }: { readonly subtitle: CompositionSubtitle }) {
  const frame = useCurrentFrame();
  const textAlign = subtitle.style.alignment;
  const entrance = Math.min(1, frame / 6);
  const animation = subtitle.style.animation;
  const animatedOpacity = animation === 'none' ? 1 : entrance;
  const animatedScale =
    animation === 'pop'
      ? 0.8 + entrance * 0.2
      : // A quick decaying oscillation: overshoots past 1 then settles, distinct
        // from `pop`'s fixed grow-in-from-smaller curve.
        animation === 'bounce'
        ? 1 + Math.sin(entrance * Math.PI * 2) * (1 - entrance) * 0.25
        : 1;
  const animatedY =
    animation === 'slide-up'
      ? (1 - entrance) * 24
      : animation === 'slide-down'
        ? -(1 - entrance) * 24
        : 0;
  const animatedX =
    animation === 'slide-left'
      ? (1 - entrance) * 24
      : animation === 'slide-right'
        ? -(1 - entrance) * 24
        : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${subtitle.style.positionX * 100}%`,
        top: `${subtitle.style.positionY * 100}%`,
        width: `${subtitle.style.maxWidth * 100}%`,
        transform: `translate(calc(-50% + ${animatedX}px), calc(-50% + ${animatedY}px)) rotate(${subtitle.style.rotation}deg) scale(${subtitle.style.scale * animatedScale})`,
        opacity: subtitle.style.opacity * animatedOpacity,
        textAlign,
        fontFamily: subtitle.style.fontFamily,
        fontSize: subtitle.style.fontSize,
        fontWeight: subtitle.style.fontWeight,
        fontStyle: subtitle.style.isItalic ? 'italic' : 'normal',
        textDecoration: subtitle.style.isUnderlined ? 'underline' : 'none',
        letterSpacing: subtitle.style.letterSpacing,
        lineHeight: subtitle.style.lineHeight,
        color: subtitle.style.foreground,
        whiteSpace: 'pre-wrap',
      }}
    >
      <span
        style={{
          backgroundColor: subtitle.style.backgroundEnabled
            ? colorWithOpacity(subtitle.style.background, subtitle.style.backgroundOpacity)
            : 'transparent',
          boxDecorationBreak: 'clone',
          padding: subtitle.style.padding,
          borderRadius: subtitle.style.borderRadius,
          WebkitTextStroke:
            subtitle.style.strokeWidth > 0
              ? `${subtitle.style.strokeWidth}px ${subtitle.style.strokeColor}`
              : undefined,
          paintOrder: 'stroke fill',
          textShadow:
            subtitle.style.shadowOpacity > 0
              ? `${subtitle.style.shadowOffsetX}px ${subtitle.style.shadowOffsetY}px ${subtitle.style.shadowBlur}px ${colorWithOpacity(subtitle.style.shadowColor, subtitle.style.shadowOpacity)}`
              : undefined,
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

function colorWithOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  if (opacity <= 0) return 'transparent';
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (hex) {
    return `rgba(${Number.parseInt(hex[1] ?? '0', 16)}, ${Number.parseInt(hex[2] ?? '0', 16)}, ${Number.parseInt(hex[3] ?? '0', 16)}, ${opacity})`;
  }
  return `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`;
}

function RenderedClip({ clip }: { readonly clip: CompositionClip }) {
  const frame = useCurrentFrame();
  if (clip.mediaKind === 'audio') {
    return (
      <Audio
        src={clip.src}
        trimBefore={clip.sourceStartFrame}
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
  // OffthreadVideo rather than <Video>: inside the Player it degrades to a
  // regular <video> element (identical preview behavior), while headless
  // rendering extracts frames server-side — which is what lets an export job
  // reference the user's media by plain absolute path instead of a URL the
  // sandboxed browser could never load (ADR-0011).
  return (
    <>
      <OffthreadVideo
        src={clip.src}
        trimBefore={clip.sourceStartFrame}
        style={{
          height: '100%',
          width: '100%',
          objectFit: 'contain',
          opacity: opacity * transition.opacity,
          mixBlendMode: clip.blendMode,
          clipPath: transition.clipPath,
          transform: `translate(${positionX * 100}%, ${positionY * 100}%) translateX(${transition.translateX}%) translateY(${transition.translateY}%) rotate(${rotation}deg) scale(${scaleX * transition.scale}, ${scaleY * transition.scale})`,
        }}
      />
      {transition.flashOpacity > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: 'white',
            opacity: transition.flashOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
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
  readonly translateY: number;
  readonly scale: number;
  readonly clipPath: string | undefined;
  /** White flash overlay opacity, used by dip-to-white since the composition's own background is black. */
  readonly flashOpacity: number;
}

/** How far a zoom-in transition punches in/out, as a fraction of normal scale. */
const ZOOM_IN_AMOUNT = 0.15;

function transitionVisualState(clip: CompositionClip, frame: number): TransitionVisualState {
  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let clipPath: string | undefined;
  let flashOpacity = 0;

  const incoming = clip.transitionIn;
  if (incoming) {
    const progress = clamp01(frame / incoming.durationInFrames);
    if (incoming.kind === 'dip-to-black') opacity *= clamp01((progress - 0.5) * 2);
    else if (incoming.kind === 'dip-to-white') {
      const dipOpacity = clamp01((progress - 0.5) * 2);
      opacity *= dipOpacity;
      flashOpacity = Math.max(flashOpacity, 1 - dipOpacity);
    } else if (!isDirectionalTransition(incoming.kind)) opacity *= progress;
    if (incoming.kind === 'slide-left') translateX += (1 - progress) * 100;
    if (incoming.kind === 'slide-right') translateX -= (1 - progress) * 100;
    if (incoming.kind === 'slide-up') translateY += (1 - progress) * 100;
    if (incoming.kind === 'slide-down') translateY -= (1 - progress) * 100;
    if (incoming.kind === 'wipe-left') clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
    if (incoming.kind === 'wipe-right') clipPath = `inset(0 0 0 ${(1 - progress) * 100}%)`;
    if (incoming.kind === 'wipe-up') clipPath = `inset(0 0 ${(1 - progress) * 100}% 0)`;
    if (incoming.kind === 'wipe-down') clipPath = `inset(${(1 - progress) * 100}% 0 0 0)`;
    if (incoming.kind === 'zoom-in') scale *= 1 + (1 - progress) * ZOOM_IN_AMOUNT;
  }

  const outgoing = clip.transitionOut;
  if (outgoing) {
    const startsAt = clip.durationInFrames;
    const progress = clamp01((frame - startsAt) / outgoing.durationInFrames);
    if (outgoing.kind === 'dip-to-black') opacity *= 1 - clamp01(progress * 2);
    else if (outgoing.kind === 'dip-to-white') {
      const dipOpacity = 1 - clamp01(progress * 2);
      opacity *= dipOpacity;
      flashOpacity = Math.max(flashOpacity, 1 - dipOpacity);
    } else if (!isDirectionalTransition(outgoing.kind)) opacity *= 1 - progress;
    if (outgoing.kind === 'slide-left') translateX -= progress * 100;
    if (outgoing.kind === 'slide-right') translateX += progress * 100;
    if (outgoing.kind === 'slide-up') translateY -= progress * 100;
    if (outgoing.kind === 'slide-down') translateY += progress * 100;
    if (outgoing.kind === 'zoom-in') scale *= 1 - progress * ZOOM_IN_AMOUNT;
  }
  return { opacity, translateX, translateY, scale, clipPath, flashOpacity };
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

/**
 * Transitions that reveal the incoming/outgoing clip through position or a
 * clip-path mask rather than through opacity. Their clip stays fully opaque
 * for the crossfade component of `transitionVisualState`; `zoom-in` is
 * deliberately excluded because it crossfades and scales together.
 */
function isDirectionalTransition(kind: string): boolean {
  return (
    kind === 'slide-left' ||
    kind === 'slide-right' ||
    kind === 'slide-up' ||
    kind === 'slide-down' ||
    kind === 'wipe-left' ||
    kind === 'wipe-right' ||
    kind === 'wipe-up' ||
    kind === 'wipe-down'
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
