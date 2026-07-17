import type { AssetId, ClipId, Milliseconds, TrackId } from '@videodip/shared';

/**
 * Open track classification metadata.
 *
 * The timeline domain deliberately does not enumerate kinds. Core features,
 * plugins, and future editors may introduce values such as `overlay`,
 * `adjustment`, or `ai-annotation` without changing this package. Consumers
 * decide how a kind renders; timeline operations care only about track ids.
 */
export type TrackKind = string;

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
