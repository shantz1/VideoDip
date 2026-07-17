import type { AssetId } from '@videodip/shared';
import type { MediaItem } from './media.types.js';

/**
 * Derives a display name from an absolute path.
 *
 * Handles both `/` and `\` separators — paths arrive from the Tauri dialog
 * plugin, which returns native OS paths, and this runs on Windows, macOS and
 * Linux alike.
 */
function basename(path: string): string {
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
export function createMediaItem(path: string): MediaItem {
  return {
    id: crypto.randomUUID() as AssetId,
    path,
    name: basename(path),
  };
}
