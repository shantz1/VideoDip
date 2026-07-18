import { describe, expect, it } from 'vitest';
import { createDeterministicTimelineIdProvider } from './identity.service.js';

describe('deterministic timeline IDs', () => {
  it('replays the same independent entity sequences for the same namespace', () => {
    const first = createDeterministicTimelineIdProvider('edit-7');
    const replay = createDeterministicTimelineIdProvider('edit-7');

    expect([first.nextTrackId(), first.nextClipId(), first.nextClipId()]).toEqual([
      replay.nextTrackId(),
      replay.nextClipId(),
      replay.nextClipId(),
    ]);
    expect(first.nextTransitionId()).toBe('edit-7-transition-1');
  });

  it('rejects an empty namespace instead of creating invalid IDs', () => {
    expect(() => createDeterministicTimelineIdProvider('   ')).toThrow(/must not be empty/);
  });
});
