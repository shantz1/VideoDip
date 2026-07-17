import type { AssetId } from '@videodip/shared';

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
}
