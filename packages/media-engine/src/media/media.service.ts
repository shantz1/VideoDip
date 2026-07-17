import type { AssetId } from '@videodip/shared';
import type { CreateMediaItemInput, MediaItem, MediaKind } from './media.types.js';

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);

/**
 * Derives a display name from an absolute path.
 *
 * Handles both `/` and `\` separators — paths arrive from the Tauri dialog
 * plugin, which returns native OS paths, and this runs on Windows, macOS and
 * Linux alike.
 */
export function getMediaName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? path;
}

/**
 * Builds a {@link MediaItem} from a path picked by the user.
 *
 * The id is minted here because this is the one place a `MediaItem` comes
 * into existence — branded types are cast at their construction boundary,
 * never at each call site that merely handles one.
 */
export function createMediaItem(input: CreateMediaItemInput): MediaItem {
  return {
    id: crypto.randomUUID() as AssetId,
    locator: input.locator,
    name: input.name,
    kind: input.kind,
    duration: input.metadata?.duration ?? input.duration ?? null,
    metadata: input.metadata ?? null,
  };
}

/** Infers the timeline-safe media category from a picked file's extension. */
export function getMediaKind(path: string): MediaKind {
  const extension = path.replace(/\\/g, '/').split('.').at(-1)?.toLowerCase();
  return extension !== undefined && AUDIO_EXTENSIONS.has(extension) ? 'audio' : 'video';
}
