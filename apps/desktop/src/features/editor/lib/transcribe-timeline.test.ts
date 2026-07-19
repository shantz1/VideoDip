import { ms, type AssetId, type TrackId } from '@videodip/shared';
import { addClip, createTimeline, createTrack, updateTrackState } from '@videodip/timeline';
import { describe, expect, it, vi } from 'vitest';
import { toTimelineAudioClips } from './transcribe-timeline';

const VIDEO = 'video' as TrackId;
const ASSET = 'asset-a' as AssetId;

function timelineWithClip() {
  const document = createTimeline([createTrack({ id: VIDEO, kind: 'video', label: 'Video' })]);
  const result = addClip(document, {
    trackId: VIDEO,
    assetId: ASSET,
    start: ms(500),
    duration: ms(1000),
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function update(
  document: ReturnType<typeof timelineWithClip>,
  patch: { isVisible?: boolean; isMuted?: boolean },
) {
  const result = updateTrackState(document, VIDEO, patch);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('toTimelineAudioClips', () => {
  it('excludes hidden tracks before resolving their media', () => {
    const resolvePath = vi.fn(() => 'C:\\media\\a.mp4');
    const result = toTimelineAudioClips(
      update(timelineWithClip(), { isVisible: false }),
      resolvePath,
    );
    expect(result).toEqual({ ok: true, value: [] });
    expect(resolvePath).not.toHaveBeenCalled();
  });

  it('combines persisted track mute with clip audio settings', () => {
    const result = toTimelineAudioClips(
      update(timelineWithClip(), { isMuted: true }),
      () => 'C:\\media\\a.mp4',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]).toMatchObject({ start: 500, isMuted: true });
  });
});
