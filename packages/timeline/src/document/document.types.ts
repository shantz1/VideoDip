import type { AssetId, ClipId, Milliseconds, Normalized, TrackId } from '@videodip/shared';

/**
 * Open track classification metadata.
 *
 * The timeline domain deliberately does not enumerate kinds. Core features,
 * plugins, and future editors may introduce values such as `overlay`,
 * `adjustment`, or `ai-annotation` without changing this package. Consumers
 * decide how a kind renders; timeline operations care only about track ids.
 */
export type TrackKind = string;

/** Blend modes supported consistently by preview and native export. */
export type ClipBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

/** Canvas-relative visual transform; positions are fractions of the output frame. */
export interface ClipTransform {
  readonly positionX: number;
  readonly positionY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
}

/** Flat JSON metadata available to plugins without owning core clip fields. */
export type ClipMetadata = Readonly<Record<string, string | number | boolean | null>>;

/** Static clip fields that can be animated over clip-relative time. */
export type ClipAnimationProperty = keyof ClipTransform | 'opacity';

/** Easing applied while approaching a keyframe from the previous keyframe. */
export type ClipKeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** One serializable keyframe at a clip-relative offset. */
export interface ClipKeyframe {
  readonly property: ClipAnimationProperty;
  readonly offset: Milliseconds;
  readonly value: number;
  readonly easing: ClipKeyframeEasing;
}

/** Per-clip audio mix settings shared by preview and native export. */
export interface ClipAudioSettings {
  readonly volume: Normalized;
  readonly isMuted: boolean;
  readonly fadeIn: Milliseconds;
  readonly fadeOut: Milliseconds;
}

/**
 * A placed instance of a media asset on the timeline.
 *
 * `sourceStart` is the offset within the source media; `start` and `duration`
 * describe where the clip sits on the project timeline. Splitting or trimming
 * changes both coordinate spaces together.
 */
export interface Clip {
  readonly id: ClipId;
  readonly trackId: TrackId;
  readonly assetId: AssetId;
  /** Position on the timeline. */
  readonly start: Milliseconds;
  /** Length on the timeline. */
  readonly duration: Milliseconds;
  /** Offset into the source media where this clip begins. */
  readonly sourceStart: Milliseconds;
  readonly transform: ClipTransform;
  readonly opacity: Normalized;
  readonly blendMode: ClipBlendMode;
  /** Disabled clips remain on the timeline but do not preview or export. */
  readonly isEnabled: boolean;
  readonly metadata: ClipMetadata;
  readonly animation: readonly ClipKeyframe[];
  readonly audio: ClipAudioSettings;
}

/** A generic ordered clip container whose kind is consumer-defined metadata. */
export interface Track {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly label: string;
  readonly clips: readonly Clip[];
}

/**
 * The complete undoable timeline document.
 *
 * Track order is top-to-bottom as shown in a timeline UI. Rendering consumers
 * reverse that order when compositing from the visual background upward.
 */
export interface TimelineDocument {
  readonly tracks: readonly Track[];
}
