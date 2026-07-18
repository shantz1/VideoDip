import { describe, expect, it } from 'vitest';
import { workspaceGridTemplate } from './workspace-layout';

describe('workspaceGridTemplate', () => {
  it('extends both side panels beside the short-video timeline', () => {
    expect(workspaceGridTemplate('short-video')).toBe(
      '"library preview inspector" "library timeline inspector"',
    );
  });

  it('gives standard video editing a full-width lower timeline', () => {
    expect(workspaceGridTemplate('video')).toBe(
      '"library preview inspector" "timeline timeline timeline"',
    );
  });
});
