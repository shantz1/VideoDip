import { type ProjectId } from '@videodip/shared';
import { createTimeline } from '@videodip/timeline';
import { describe, expect, it } from 'vitest';
import { buildProjectSnapshot } from './project-snapshot';

const source = {
  id: 'project-a' as ProjectId,
  name: 'Project A',
  aspectRatio: '9:16' as const,
  timeline: createTimeline(),
  mediaItems: [],
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T10:01:00.000Z',
};

describe('buildProjectSnapshot', () => {
  it('creates a versioned storage document', () => {
    const result = buildProjectSnapshot(source);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ version: 1, id: source.id });
  });

  it('returns a recoverable validation error for invalid state', () => {
    const result = buildProjectSnapshot({ ...source, name: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.recovery).toMatch(/latest edit|missing media/i);
    }
  });
});
