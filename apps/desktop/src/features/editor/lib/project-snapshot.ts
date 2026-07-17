import {
  PROJECT_SNAPSHOT_VERSION,
  appError,
  err,
  ok,
  projectSnapshotSchema,
  type ProjectId,
  type ProjectSnapshot,
  type Result,
} from '@videodip/shared';
import type { MediaItem } from '@videodip/media-engine';
import type { TimelineDocument } from '@videodip/timeline';
import type { SubtitleDocument } from '@videodip/subtitle-engine';
import type { AspectRatio } from '../editor.store';

export interface ProjectSnapshotSource {
  readonly id: ProjectId;
  readonly name: string;
  readonly aspectRatio: AspectRatio;
  readonly timeline: TimelineDocument;
  readonly mediaItems: readonly MediaItem[];
  readonly subtitles?: SubtitleDocument;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Builds and validates the only project shape allowed to cross a storage boundary. */
export function buildProjectSnapshot(source: ProjectSnapshotSource): Result<ProjectSnapshot> {
  const parsed = projectSnapshotSchema.safeParse({
    version: PROJECT_SNAPSHOT_VERSION,
    ...source,
  });
  if (parsed.success) return ok(parsed.data);
  return err(
    appError(
      'VALIDATION',
      `The project snapshot is invalid: ${parsed.error.message}`,
      'Undo the latest edit or remove missing media, then try saving again.',
      { cause: parsed.error },
    ),
  );
}
