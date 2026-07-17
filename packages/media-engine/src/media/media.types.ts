import type { AssetId, Milliseconds } from '@videodip/shared';

/** Media categories the timeline and renderer can place without probing codecs. */
export type MediaKind = 'video' | 'audio';

/**
 * A media file the user has imported.
 *
 * Path + name only. Duration, codec, dimensions and thumbnails arrive with
 * FFmpeg probing — deliberately absent until that lands, rather than faked.
 */
export interface MediaItem {
  readonly id: AssetId;
  /** Absolute path on the user's machine. Never uploaded (ADR-0002). */
  readonly path: string;
  /** Display name, derived from the path's basename. */
  readonly name: string;
  /** Determines the default timeline track and preview element. */
  readonly kind: MediaKind;
  /** Decoded source length, or `null` when the platform cannot probe it. */
  readonly duration: Milliseconds | null;
}
