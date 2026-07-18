import { describe, expect, it } from 'vitest';
import { PROJECT_SNAPSHOT_VERSION, projectSnapshotSchema } from './project.schema.js';

const SNAPSHOT = {
  version: PROJECT_SNAPSHOT_VERSION,
  id: 'project-a',
  name: 'Demo project',
  aspectRatio: '9:16',
  timeline: {
    tracks: [
      {
        id: 'video',
        kind: 'video',
        label: 'Video',
        clips: [
          {
            id: 'clip-a',
            trackId: 'video',
            assetId: 'asset-a',
            start: 0,
            duration: 1000,
            sourceStart: 0,
          },
        ],
      },
    ],
  },
  mediaItems: [
    {
      id: 'asset-a',
      locator: 'opaque:asset-a',
      name: 'clip.mp4',
      kind: 'video',
      duration: 1000,
      metadata: null,
    },
  ],
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T10:01:00.000Z',
} as const;

describe('projectSnapshotSchema', () => {
  it('accepts a valid versioned project snapshot', () => {
    expect(projectSnapshotSchema.safeParse(SNAPSHOT).success).toBe(true);
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, aspectRatio: '1:1' }).success).toBe(true);
  });

  it('adds backward-compatible visual defaults to older v1 clips', () => {
    const result = projectSnapshotSchema.parse(SNAPSHOT);
    expect(result.timeline.tracks[0]?.clips[0]).toMatchObject({
      transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      opacity: 1,
      blendMode: 'normal',
      isEnabled: true,
      metadata: {},
      animation: [],
      audio: { volume: 1, isMuted: false, fadeIn: 0, fadeOut: 0 },
    });
    expect(result.subtitles).toMatchObject({ version: 1, language: null, segments: [] });
    expect(result.timeline.transitions).toEqual([]);
  });

  it('persists valid adjacent-clip transitions and rejects dangling cuts', () => {
    const first = SNAPSHOT.timeline.tracks[0].clips[0];
    const second = {
      ...first,
      id: 'clip-b',
      assetId: 'asset-b',
      start: 1000,
    };
    const tracks = [{ ...SNAPSHOT.timeline.tracks[0], clips: [first, second] }];
    const mediaItems = [
      ...SNAPSHOT.mediaItems,
      { ...SNAPSHOT.mediaItems[0], id: 'asset-b', locator: 'opaque:asset-b' },
    ];
    const transition = {
      id: 'transition-a',
      trackId: 'video',
      fromClipId: 'clip-a',
      toClipId: 'clip-b',
      kind: 'crossfade',
      duration: 500,
    };
    expect(
      projectSnapshotSchema.safeParse({
        ...SNAPSHOT,
        timeline: { tracks, transitions: [transition] },
        mediaItems,
      }).success,
    ).toBe(true);
    expect(
      projectSnapshotSchema.safeParse({
        ...SNAPSHOT,
        timeline: { tracks, transitions: [{ ...transition, toClipId: 'missing' }] },
        mediaItems,
      }).success,
    ).toBe(false);
  });

  it('validates persisted subtitle timing and word boundaries', () => {
    const parsed = projectSnapshotSchema.safeParse({
      ...SNAPSHOT,
      subtitles: {
        version: 1,
        language: 'en',
        defaultStyle: {
          fontFamily: null,
          fontSize: null,
          foreground: null,
          background: null,
          isBold: false,
          isItalic: false,
          isUnderlined: false,
          alignment: 'center',
          positionX: 0.5,
          positionY: 0.88,
        },
        segments: [
          {
            id: 'caption-a',
            start: 0,
            end: 1000,
            text: 'Hello',
            style: {},
            speaker: null,
            words: [{ id: 'hello', text: 'Hello', start: 0, end: 1000, confidence: 0.9 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subtitles.defaultStyle).toMatchObject({
        fontFamily: 'sans-serif',
        fontSize: 48,
        fontWeight: 400,
        foreground: '#ffffff',
        background: '#000000',
        backgroundOpacity: 0.72,
        strokeWidth: 0,
        positionX: 0.5,
        positionY: 0.88,
        rotation: 0,
        scale: 1,
        animation: 'fade',
      });
    }
  });

  it('round-trips the complete professional subtitle style surface', () => {
    const style = {
      ...projectSnapshotSchema.parse(SNAPSHOT).subtitles.defaultStyle,
      fontFamily: 'system-ui',
      fontSize: 72,
      fontWeight: 800,
      letterSpacing: 1.5,
      lineHeight: 1.1,
      opacity: 0.9,
      backgroundEnabled: false,
      backgroundOpacity: 0.5,
      strokeColor: '#ff00aa',
      strokeWidth: 3,
      shadowColor: '#001122',
      shadowBlur: 12,
      shadowOffsetX: 4,
      shadowOffsetY: 6,
      shadowOpacity: 0.65,
      maxWidth: 0.8,
      padding: 20,
      borderRadius: 14,
      rotation: -8,
      scale: 1.25,
    };
    const parsed = projectSnapshotSchema.parse({
      ...SNAPSHOT,
      subtitles: { version: 1, language: null, segments: [], defaultStyle: style },
    });

    expect(parsed.subtitles.defaultStyle).toEqual(style);
  });

  it('rejects unsafe clip transform and metadata values', () => {
    const clip = {
      ...SNAPSHOT.timeline.tracks[0].clips[0],
      transform: { positionX: 0, positionY: 0, scaleX: 0, scaleY: 1, rotation: 0 },
      metadata: { score: Number.POSITIVE_INFINITY },
    };
    const tracks = [{ ...SNAPSHOT.timeline.tracks[0], clips: [clip] }];
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, timeline: { tracks } }).success).toBe(
      false,
    );
  });

  it('rejects unknown versions and unknown fields', () => {
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, version: 2 }).success).toBe(false);
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, secret: true }).success).toBe(false);
  });

  it('rejects clips stored under the wrong track', () => {
    const tracks = [{ ...SNAPSHOT.timeline.tracks[0], id: 'other-track' }];
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, timeline: { tracks } }).success).toBe(
      false,
    );
  });

  it('rejects overlapping clips and duplicate clip ids', () => {
    const first = SNAPSHOT.timeline.tracks[0].clips[0];
    const clips = [first, { ...first, start: 500 }];
    const tracks = [{ ...SNAPSHOT.timeline.tracks[0], clips }];
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, timeline: { tracks } }).success).toBe(
      false,
    );
  });

  it('rejects clips whose media is absent from the project library', () => {
    expect(projectSnapshotSchema.safeParse({ ...SNAPSHOT, mediaItems: [] }).success).toBe(false);
  });
});
