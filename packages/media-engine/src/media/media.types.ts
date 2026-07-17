import type {
  AssetId,
  ImportedMediaReference,
  MediaKind,
  MediaLocator,
  Milliseconds,
} from '@videodip/shared';

export type { MediaKind } from '@videodip/shared';

/** Metadata for one stream reported by a media probe. */
export interface MediaStreamMetadata {
  readonly index: number;
  readonly kind: 'video' | 'audio' | 'other';
  readonly codec: string;
  readonly duration: Milliseconds | null;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
}

/** Validated container and stream metadata returned by FFprobe or another host probe. */
export interface MediaMetadata {
  readonly duration: Milliseconds;
  readonly format: string;
  readonly sizeBytes: number | null;
  readonly bitrate: number | null;
  readonly streams: readonly MediaStreamMetadata[];
}

/** Input for creating a media item from a host-neutral import result. */
export interface CreateMediaItemInput extends ImportedMediaReference {
  readonly duration?: Milliseconds | null;
  readonly metadata?: MediaMetadata | null;
}

/** A media source imported into a project library. */
export interface MediaItem {
  readonly id: AssetId;
  /** Opaque desktop path or browser storage key; resolve through a host adapter. */
  readonly locator: MediaLocator;
  readonly name: string;
  readonly kind: MediaKind;
  /** Best known source length, or `null` when every available probe failed. */
  readonly duration: Milliseconds | null;
  /** Full probed metadata when available. */
  readonly metadata: MediaMetadata | null;
}
