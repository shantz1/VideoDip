import { z } from 'zod';
import {
  assetIdSchema,
  clipIdSchema,
  mediaLocatorSchema,
  millisecondsSchema,
  projectIdSchema,
  trackIdSchema,
} from './primitive.schema.js';

/** Current on-disk project snapshot version. Increment only with a migration. */
export const PROJECT_SNAPSHOT_VERSION = 1 as const;

/** Project canvas ratios supported by the current editor and export path. */
export const projectAspectRatioSchema = z.enum(['9:16', '3:4', '4:5', '16:9']);

const mediaStreamMetadataSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  kind: z.enum(['video', 'audio', 'other']),
  codec: z.string().min(1),
  duration: millisecondsSchema.nullable(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().finite().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
});

const mediaMetadataSchema = z.strictObject({
  duration: millisecondsSchema,
  format: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().nullable(),
  bitrate: z.number().finite().nonnegative().nullable(),
  streams: z.array(mediaStreamMetadataSchema),
});

/** Validated persisted media-library entry with an opaque host locator. */
export const projectMediaItemSchema = z.strictObject({
  id: assetIdSchema,
  locator: mediaLocatorSchema,
  name: z.string().trim().min(1).max(512),
  kind: z.enum(['video', 'audio']),
  duration: millisecondsSchema.nullable(),
  metadata: mediaMetadataSchema.nullable(),
});

const projectClipSchema = z.strictObject({
  id: clipIdSchema,
  trackId: trackIdSchema,
  assetId: assetIdSchema,
  start: millisecondsSchema,
  duration: millisecondsSchema.refine(
    (duration) => duration > 0,
    'Clip duration must be positive.',
  ),
  sourceStart: millisecondsSchema,
});

const projectTrackSchema = z
  .strictObject({
    id: trackIdSchema,
    kind: z.string().trim().min(1).max(128),
    label: z.string().trim().min(1).max(128),
    clips: z.array(projectClipSchema),
  })
  .superRefine((track, context) => {
    const ids = new Set<string>();
    const ordered = [...track.clips].sort((left, right) => left.start - right.start);
    for (const [index, clip] of track.clips.entries()) {
      if (clip.trackId !== track.id) {
        context.addIssue({
          code: 'custom',
          path: ['clips', index, 'trackId'],
          message: 'Clip trackId must match its containing track.',
        });
      }
      if (ids.has(clip.id)) {
        context.addIssue({
          code: 'custom',
          path: ['clips', index, 'id'],
          message: 'Clip ids must be unique within a track.',
        });
      }
      ids.add(clip.id);
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (previous && current && previous.start + previous.duration > current.start) {
        context.addIssue({
          code: 'custom',
          path: ['clips'],
          message: 'Clips on the same track must not overlap.',
        });
        break;
      }
    }
  });

/** Complete versioned project snapshot crossing IPC and disk boundaries. */
export const projectSnapshotSchema = z
  .strictObject({
    version: z.literal(PROJECT_SNAPSHOT_VERSION),
    id: projectIdSchema,
    name: z.string().trim().min(1).max(160),
    aspectRatio: projectAspectRatioSchema,
    timeline: z.strictObject({ tracks: z.array(projectTrackSchema) }),
    mediaItems: z.array(projectMediaItemSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((project, context) => {
    const trackIds = new Set<string>();
    const clipIds = new Set<string>();
    const assetIds = new Set(project.mediaItems.map((item) => String(item.id)));
    for (const [trackIndex, track] of project.timeline.tracks.entries()) {
      if (trackIds.has(track.id)) {
        context.addIssue({
          code: 'custom',
          path: ['timeline', 'tracks', trackIndex, 'id'],
          message: 'Track ids must be unique.',
        });
      }
      trackIds.add(track.id);
      for (const [clipIndex, clip] of track.clips.entries()) {
        if (clipIds.has(clip.id)) {
          context.addIssue({
            code: 'custom',
            path: ['timeline', 'tracks', trackIndex, 'clips', clipIndex, 'id'],
            message: 'Clip ids must be unique across the project.',
          });
        }
        clipIds.add(clip.id);
        if (!assetIds.has(clip.assetId)) {
          context.addIssue({
            code: 'custom',
            path: ['timeline', 'tracks', trackIndex, 'clips', clipIndex, 'assetId'],
            message: 'Every clip must reference a media-library asset.',
          });
        }
      }
    }
  });

/** Validated project snapshot used by every desktop/browser repository. */
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;

/** Lightweight project picker row returned without loading full snapshots. */
export const projectSummarySchema = z.strictObject({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(160),
  updatedAt: z.iso.datetime(),
});

/** Validated project-list entry ordered newest first by repositories. */
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
