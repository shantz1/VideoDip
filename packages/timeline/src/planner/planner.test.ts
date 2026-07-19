import { ms, normalized, type AssetId, type TrackId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { createTimeline, createTrack } from '../document/document.service.js';
import type { TimelineDocument } from '../document/document.types.js';
import { commitTimelineTransaction, createTimelineHistory } from '../history/history.service.js';
import { createDeterministicTimelineIdProvider } from '../identity/identity.service.js';
import { planTimelineEdit } from './planner.service.js';
import type { TimelineEditIntent, TimelineEditPlannerOptions } from './planner.types.js';

const VIDEO = 'video' as TrackId;
const AUDIO = 'audio' as TrackId;
const ASSET = 'asset-a' as AssetId;

describe('planTimelineEdit', () => {
  it('plans an add with deterministic identity without mutating the input document', () => {
    const document = timeline();
    const planned = planTimelineEdit(
      document,
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(2000) },
      },
      { idProvider: createDeterministicTimelineIdProvider('planner') },
    );

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value).toMatchObject({ label: 'Add clip', before: document });
    expect(planned.value.after.tracks[0]?.clips[0]?.id).toBe('planner-clip-1');
    expect(document.tracks[0]?.clips).toEqual([]);
  });

  it('propagates document validation failures without exposing a transaction', () => {
    const document = after(timeline(), {
      type: 'clip.add',
      input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(2000) },
    });
    const result = planTimelineEdit(document, {
      type: 'clip.add',
      input: { trackId: VIDEO, assetId: ASSET, start: ms(1000), duration: ms(2000) },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('maps clip timing, appearance, animation, and audio intents to existing operations', () => {
    const idProvider = createDeterministicTimelineIdProvider('clip-flow');
    const options = { idProvider };
    let document = after(
      timeline(),
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(3000) },
      },
      options,
    );
    const clipId = document.tracks[0]!.clips[0]!.id;

    document = after(
      document,
      {
        type: 'clip.properties.update',
        clipId,
        patch: { transform: { rotation: 15 }, opacity: normalized(0.75) },
      },
      options,
    );
    document = after(
      document,
      { type: 'clip.audio.update', clipId, patch: { volume: normalized(0.5) } },
      options,
    );
    document = after(
      document,
      {
        type: 'clip.animation.set',
        clipId,
        animation: [{ property: 'opacity', offset: ms(0), value: 0, easing: 'linear' }],
      },
      options,
    );
    document = after(
      document,
      { type: 'clip.move', clipId, start: ms(1000), trackId: AUDIO },
      options,
    );
    document = after(document, { type: 'clip.trim', clipId, edge: 'end', time: ms(3500) }, options);
    document = after(document, { type: 'clip.split', clipId, time: ms(2000) }, options);

    const clips = document.tracks.find((track) => track.id === AUDIO)?.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({
      id: clipId,
      start: 1000,
      duration: 1000,
      transform: { rotation: 15 },
      opacity: 0.75,
      audio: { volume: 0.5 },
    });
    expect(clips[1]?.id).toBe('clip-flow-clip-2');
  });

  it('plans a multi-clip delete as one history transaction', () => {
    const idProvider = createDeterministicTimelineIdProvider('delete');
    const options = { idProvider };
    let document = after(
      timeline(),
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) },
      },
      options,
    );
    document = after(
      document,
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(2000), duration: ms(1000) },
      },
      options,
    );
    const clipIds = document.tracks[0]!.clips.map((clip) => clip.id);
    const history = createTimelineHistory(document);
    if (!history.ok) throw new Error(history.error.message);
    const planned = planTimelineEdit(document, { type: 'clip.remove', clipIds });
    if (!planned.ok) throw new Error(planned.error.message);
    const committed = commitTimelineTransaction(history.value, planned.value);

    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(committed.value.past).toHaveLength(1);
    expect(committed.value.past[0]?.label).toBe('Remove clips');
    expect(committed.value.document.tracks[0]?.clips).toEqual([]);
  });

  it('plans track and transition edit families through one contract', () => {
    const idProvider = createDeterministicTimelineIdProvider('families');
    const options = { idProvider };
    let document = after(
      timeline(),
      { type: 'track.add', input: { kind: 'overlay', label: 'Overlay' }, index: 0 },
      options,
    );
    const overlayId = document.tracks[0]!.id;
    document = after(document, { type: 'track.reorder', trackId: overlayId, index: 2 }, options);
    document = after(document, { type: 'track.remove', trackId: overlayId }, options);

    document = after(
      document,
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) },
      },
      options,
    );
    document = after(
      document,
      {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(1000), duration: ms(1000) },
      },
      options,
    );
    const [from, to] = document.tracks[0]!.clips;
    if (!from || !to) throw new Error('Expected adjacent clips.');
    document = after(
      document,
      {
        type: 'transition.add',
        input: {
          fromClipId: from.id,
          toClipId: to.id,
          kind: 'crossfade',
          duration: ms(250),
        },
      },
      options,
    );
    const transitionId = document.transitions[0]!.id;
    document = after(
      document,
      {
        type: 'transition.update',
        transitionId,
        patch: { kind: 'wipe-left' },
      },
      options,
    );
    expect(document.transitions[0]?.kind).toBe('wipe-left');
    document = after(document, { type: 'transition.remove', transitionId }, options);

    expect(document.transitions).toEqual([]);
    expect(document.tracks.map((track) => track.id)).toEqual([VIDEO, AUDIO]);
  });

  it('rejects an empty multi-delete intent', () => {
    const result = planTimelineEdit(timeline(), { type: 'clip.remove', clipIds: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects edits on locked tracks but permits an explicit unlock intent', () => {
    let document = after(timeline(), {
      type: 'track.state.update',
      trackId: VIDEO,
      patch: { isLocked: true },
    });
    const rejected = planTimelineEdit(document, {
      type: 'clip.add',
      input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.recovery).toContain('Unlock');

    document = after(document, {
      type: 'track.state.update',
      trackId: VIDEO,
      patch: { isLocked: false },
    });
    expect(
      planTimelineEdit(document, {
        type: 'clip.add',
        input: { trackId: VIDEO, assetId: ASSET, start: ms(0), duration: ms(1000) },
      }).ok,
    ).toBe(true);
  });
});

function timeline(): TimelineDocument {
  return createTimeline([
    createTrack({ id: VIDEO, kind: 'video', label: 'Video' }),
    createTrack({ id: AUDIO, kind: 'audio', label: 'Audio' }),
  ]);
}

function after(
  document: TimelineDocument,
  intent: TimelineEditIntent,
  options?: TimelineEditPlannerOptions,
): TimelineDocument {
  const result = planTimelineEdit(document, intent, options);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.after;
}
