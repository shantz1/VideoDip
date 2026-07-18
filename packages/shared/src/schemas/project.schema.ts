import { z } from 'zod';
import { ms, normalized } from '../branded/branded.js';
import {
  assetIdSchema,
  clipIdSchema,
  mediaLocatorSchema,
  millisecondsSchema,
  normalizedSchema,
  projectIdSchema,
  segmentIdSchema,
  trackIdSchema,
  transitionIdSchema,
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

const projectClipSchema = z
  .strictObject({
    id: clipIdSchema,
    trackId: trackIdSchema,
    assetId: assetIdSchema,
    start: millisecondsSchema,
    duration: millisecondsSchema.refine(
      (duration) => duration > 0,
      'Clip duration must be positive.',
    ),
    sourceStart: millisecondsSchema,
    transform: z
      .strictObject({
        positionX: z.number().finite().min(-10).max(10),
        positionY: z.number().finite().min(-10).max(10),
        scaleX: z.number().finite().positive().max(100),
        scaleY: z.number().finite().positive().max(100),
        rotation: z.number().finite().min(-36_000).max(36_000),
      })
      .default({ positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 }),
    opacity: normalizedSchema.default(normalized(1)),
    blendMode: z
      .enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'])
      .default('normal'),
    isEnabled: z.boolean().default(true),
    metadata: z
      .record(
        z.string().trim().min(1).max(128),
        z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
      )
      .refine((metadata) => Object.keys(metadata).length <= 64, 'Clip metadata has too many keys.')
      .default({}),
    animation: z
      .array(
        z.strictObject({
          property: z.enum(['positionX', 'positionY', 'scaleX', 'scaleY', 'rotation', 'opacity']),
          offset: millisecondsSchema,
          value: z.number().finite(),
          easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
        }),
      )
      .default([]),
    audio: z
      .strictObject({
        volume: normalizedSchema,
        isMuted: z.boolean(),
        fadeIn: millisecondsSchema,
        fadeOut: millisecondsSchema,
      })
      .default({
        volume: normalized(1),
        isMuted: false,
        fadeIn: ms(0),
        fadeOut: ms(0),
      }),
  })
  .superRefine((clip, context) => {
    const keys = new Set<string>();
    for (const [index, keyframe] of clip.animation.entries()) {
      const key = `${keyframe.property}:${keyframe.offset}`;
      const valueIsValid =
        keyframe.property === 'opacity'
          ? keyframe.value >= 0 && keyframe.value <= 1
          : keyframe.property === 'scaleX' || keyframe.property === 'scaleY'
            ? keyframe.value > 0 && keyframe.value <= 100
            : keyframe.property === 'positionX' || keyframe.property === 'positionY'
              ? Math.abs(keyframe.value) <= 10
              : Math.abs(keyframe.value) <= 36_000;
      if (keys.has(key) || keyframe.offset > clip.duration || !valueIsValid) {
        context.addIssue({
          code: 'custom',
          path: ['animation', index],
          message: 'Keyframes must be unique, in range, and valid for their property.',
        });
      }
      keys.add(key);
    }
    if (clip.audio.fadeIn > clip.duration || clip.audio.fadeOut > clip.duration) {
      context.addIssue({
        code: 'custom',
        path: ['audio'],
        message: 'Audio fades must stay within the clip duration.',
      });
    }
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

const projectTransitionSchema = z.strictObject({
  id: transitionIdSchema,
  trackId: trackIdSchema,
  fromClipId: clipIdSchema,
  toClipId: clipIdSchema,
  kind: z.string().trim().min(1).max(128),
  duration: millisecondsSchema.refine(
    (duration) => duration > 0,
    'Transition duration must be positive.',
  ),
  parameters: z
    .record(
      z.string().trim().min(1).max(128),
      z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    )
    .refine(
      (parameters) => Object.keys(parameters).length <= 64,
      'Transition parameters have too many keys.',
    )
    .default({}),
});

const subtitleStyleSchema = z.strictObject({
  fontFamily: z.string().trim().min(1).max(256).nullable(),
  fontSize: z.number().finite().positive().max(1000).nullable(),
  foreground: z.string().trim().min(1).max(128).nullable(),
  background: z.string().trim().min(1).max(128).nullable(),
  isBold: z.boolean(),
  isItalic: z.boolean(),
  isUnderlined: z.boolean(),
  alignment: z.enum(['start', 'center', 'end']),
  positionX: normalizedSchema,
  positionY: normalizedSchema,
  animation: z.enum(['none', 'fade', 'pop', 'slide-up']).default('fade'),
});

const subtitleStylePatchSchema = subtitleStyleSchema.partial();

const subtitleWordSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(512),
    text: z.string().trim().min(1).max(1000),
    start: millisecondsSchema,
    end: millisecondsSchema,
    confidence: normalizedSchema.nullable(),
  })
  .refine((word) => word.end > word.start, 'Subtitle word duration must be positive.');

const subtitleSegmentSchema = z
  .strictObject({
    id: segmentIdSchema,
    start: millisecondsSchema,
    end: millisecondsSchema,
    text: z.string().trim().min(1).max(10_000),
    words: z.array(subtitleWordSchema),
    style: subtitleStylePatchSchema,
    speaker: z.string().trim().min(1).max(256).nullable(),
  })
  .superRefine((segment, context) => {
    if (segment.end <= segment.start) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Cue duration must be positive.',
      });
    }
    const orderedWords = [...segment.words].sort((left, right) => left.start - right.start);
    for (const [index, word] of orderedWords.entries()) {
      const previous = orderedWords[index - 1];
      if (
        word.start < segment.start ||
        word.end > segment.end ||
        (previous !== undefined && previous.end > word.start)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['words', index],
          message: 'Word timing must be ordered and contained by its cue.',
        });
      }
    }
  });

/** Persisted subtitle document shared by desktop archives and browser storage. */
export const projectSubtitleDocumentSchema = z
  .strictObject({
    version: z.literal(1),
    language: z.string().trim().min(1).max(64).nullable(),
    segments: z.array(subtitleSegmentSchema),
    defaultStyle: subtitleStyleSchema,
  })
  .superRefine((document, context) => {
    const ids = new Set<string>();
    const ordered = [...document.segments].sort((left, right) => left.start - right.start);
    for (const [index, segment] of ordered.entries()) {
      if (ids.has(segment.id)) {
        context.addIssue({
          code: 'custom',
          path: ['segments', index, 'id'],
          message: 'Subtitle cue ids must be unique.',
        });
      }
      ids.add(segment.id);
      const previous = ordered[index - 1];
      if (previous !== undefined && previous.end > segment.start) {
        context.addIssue({
          code: 'custom',
          path: ['segments', index, 'start'],
          message: 'Subtitle cues must not overlap.',
        });
      }
    }
  });

const emptySubtitleDocument = {
  version: 1 as const,
  language: null,
  segments: [],
  defaultStyle: {
    fontFamily: null,
    fontSize: null,
    foreground: null,
    background: null,
    isBold: false,
    isItalic: false,
    isUnderlined: false,
    alignment: 'center' as const,
    positionX: normalized(0.5),
    positionY: normalized(0.88),
    animation: 'fade' as const,
  },
};

/** Complete versioned project snapshot crossing IPC and disk boundaries. */
export const projectSnapshotSchema = z
  .strictObject({
    version: z.literal(PROJECT_SNAPSHOT_VERSION),
    id: projectIdSchema,
    name: z.string().trim().min(1).max(160),
    aspectRatio: projectAspectRatioSchema,
    timeline: z.strictObject({
      tracks: z.array(projectTrackSchema),
      transitions: z.array(projectTransitionSchema).default([]),
    }),
    mediaItems: z.array(projectMediaItemSchema),
    subtitles: projectSubtitleDocumentSchema.default(emptySubtitleDocument),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((project, context) => {
    const trackIds = new Set<string>();
    const clipIds = new Set<string>();
    const tracksById = new Map<string, (typeof project.timeline.tracks)[number]>();
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
      tracksById.set(track.id, track);
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

    const transitionIds = new Set<string>();
    const transitionedCuts = new Set<string>();
    for (const [transitionIndex, transition] of project.timeline.transitions.entries()) {
      if (transitionIds.has(transition.id)) {
        context.addIssue({
          code: 'custom',
          path: ['timeline', 'transitions', transitionIndex, 'id'],
          message: 'Transition ids must be unique.',
        });
      }
      transitionIds.add(transition.id);
      const cutKey = `${transition.fromClipId}:${transition.toClipId}`;
      if (transitionedCuts.has(cutKey)) {
        context.addIssue({
          code: 'custom',
          path: ['timeline', 'transitions', transitionIndex],
          message: 'A clip cut can contain only one transition.',
        });
      }
      transitionedCuts.add(cutKey);

      const track = tracksById.get(transition.trackId);
      const ordered = track ? [...track.clips].sort((left, right) => left.start - right.start) : [];
      const fromIndex = ordered.findIndex((clip) => clip.id === transition.fromClipId);
      const from = ordered[fromIndex];
      const to = ordered[fromIndex + 1];
      if (
        !track ||
        !from ||
        !to ||
        to.id !== transition.toClipId ||
        from.start + from.duration !== to.start ||
        transition.duration > Math.min(from.duration, to.duration)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['timeline', 'transitions', transitionIndex],
          message: 'Transitions must join touching adjacent clips and fit both endpoints.',
        });
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
