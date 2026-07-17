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
