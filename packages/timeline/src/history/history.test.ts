import { appError, err, ms, type AssetId, type TrackId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { addClip, createTimeline, createTrack } from '../document/document.service.js';
import { createDeterministicTimelineIdProvider } from '../identity/identity.service.js';
import {
  commitTimelineTransaction,
  createTimelineHistory,
  createTimelineTransaction,
  redoTimelineHistory,
  undoTimelineHistory,
} from './history.service.js';

const VIDEO = 'video' as TrackId;

function emptyTimeline() {
  return createTimeline([createTrack({ id: VIDEO, kind: 'video', label: 'Video' })]);
}

describe('timeline transactions', () => {
  it('applies multiple operations atomically with deterministic result IDs', () => {
    const original = emptyTimeline();
    const ids = createDeterministicTimelineIdProvider('transaction');
    const transaction = createTimelineTransaction(original, {
      label: 'Insert two clips',
      operations: [
        (document) =>
          addClip(
            document,
            {
              trackId: VIDEO,
              assetId: 'asset-a' as AssetId,
              start: ms(0),
              duration: ms(1000),
            },
            ids,
          ),
        (document) =>
          addClip(
            document,
            {
              trackId: VIDEO,
              assetId: 'asset-b' as AssetId,
              start: ms(1000),
              duration: ms(1000),
            },
            ids,
          ),
      ],
    });

    if (!transaction.ok) throw new Error(transaction.error.message);
    expect(transaction.value.label).toBe('Insert two clips');
    expect(transaction.value.after.tracks[0]?.clips.map((clip) => clip.id)).toEqual([
      'transaction-clip-1',
      'transaction-clip-2',
    ]);
    expect(original.tracks[0]?.clips).toEqual([]);
  });

  it('does not expose a partial document when a later operation fails', () => {
    const original = emptyTimeline();
    const transaction = createTimelineTransaction(original, {
      label: 'Atomic edit',
      operations: [
        (document) =>
          addClip(document, {
            trackId: VIDEO,
            assetId: 'asset-a' as AssetId,
            start: ms(0),
            duration: ms(1000),
          }),
        () => err(appError('CONFLICT', 'Second operation failed.', 'Change the edit.')),
      ],
    });

    expect(transaction.ok).toBe(false);
    expect(original.tracks[0]?.clips).toEqual([]);
  });
});

describe('timeline transaction history', () => {
  it('undoes and redoes one labeled transaction', () => {
    const original = emptyTimeline();
    const history = createTimelineHistory(original);
    const transaction = createTimelineTransaction(original, {
      label: 'Insert clip',
      operations: [
        (document) =>
          addClip(document, {
            trackId: VIDEO,
            assetId: 'asset-a' as AssetId,
            start: ms(0),
            duration: ms(1000),
          }),
      ],
    });
    if (!history.ok || !transaction.ok) throw new Error('Expected valid history.');
    const committed = commitTimelineTransaction(history.value, transaction.value);
    if (!committed.ok) throw new Error(committed.error.message);

    expect(committed.value.past[0]?.label).toBe('Insert clip');
    const undone = undoTimelineHistory(committed.value);
    expect(undone.document).toBe(original);
    expect(undone.future[0]?.label).toBe('Insert clip');
    expect(redoTimelineHistory(undone).document).toBe(transaction.value.after);
  });

  it('rejects committing a transaction planned from a stale document', () => {
    const original = emptyTimeline();
    const history = createTimelineHistory(original);
    const transaction = createTimelineTransaction(emptyTimeline(), {
      label: 'Stale edit',
      operations: [(document) => ({ ok: true, value: document })],
    });
    if (!history.ok || !transaction.ok) throw new Error('Expected valid fixtures.');

    const result = commitTimelineTransaction(history.value, transaction.value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('rejects a manually constructed transaction with an invalid result document', () => {
    const original = emptyTimeline();
    const history = createTimelineHistory(original);
    if (!history.ok) throw new Error(history.error.message);

    const result = commitTimelineTransaction(history.value, {
      label: 'Invalid edit',
      before: original,
      after: { ...original, schemaVersion: 1 as 2 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});
