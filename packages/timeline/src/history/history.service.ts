import { appError, err, ok, type Result } from '@videodip/shared';
import { validateTimeline } from '../document/document.service.js';
import type { TimelineDocument } from '../document/document.types.js';
import type {
  TimelineHistory,
  TimelineTransaction,
  TimelineTransactionInput,
} from './history.types.js';

/** Creates empty transaction history for a validated timeline document. */
export function createTimelineHistory(document: TimelineDocument): Result<TimelineHistory> {
  const validation = validateTimeline(document);
  if (!validation.ok) return validation;
  return ok({ document, past: [], future: [] });
}

/**
 * Applies ordered pure operations atomically and validates their final document.
 *
 * A failed operation returns its original error and exposes no partial document, so callers
 * can safely keep rendering the transaction's input document.
 */
export function createTimelineTransaction(
  document: TimelineDocument,
  input: TimelineTransactionInput,
): Result<TimelineTransaction> {
  const label = input.label.trim();
  if (!label || input.operations.length === 0) {
    return err(
      appError(
        'VALIDATION',
        'A timeline transaction needs a label and at least one operation.',
        'Describe the user edit and include the operations it should apply.',
      ),
    );
  }
  const initialValidation = validateTimeline(document);
  if (!initialValidation.ok) return initialValidation;

  let next = document;
  for (const operation of input.operations) {
    const result = operation(next);
    if (!result.ok) return result;
    next = result.value;
  }

  const finalValidation = validateTimeline(next);
  if (!finalValidation.ok) return finalValidation;
  return ok({ label, before: document, after: next });
}

/** Adds a transaction to history, clearing redo entries after a divergent edit. */
export function commitTimelineTransaction(
  history: TimelineHistory,
  transaction: TimelineTransaction,
): Result<TimelineHistory> {
  if (transaction.before !== history.document) {
    return err(
      appError(
        'CONFLICT',
        'The timeline transaction was planned from a stale document.',
        'Replan the edit against the current timeline and try again.',
      ),
    );
  }
  const validation = validateTimeline(transaction.after);
  if (!validation.ok) return validation;
  if (transaction.after === transaction.before) return ok(history);
  return ok({
    document: transaction.after,
    past: [...history.past, transaction],
    future: [],
  });
}

/** Restores the document before the most recent committed user intent. */
export function undoTimelineHistory(history: TimelineHistory): TimelineHistory {
  const transaction = history.past.at(-1);
  if (!transaction) return history;
  return {
    document: transaction.before,
    past: history.past.slice(0, -1),
    future: [transaction, ...history.future],
  };
}

/** Reapplies the next transaction previously removed by undo. */
export function redoTimelineHistory(history: TimelineHistory): TimelineHistory {
  const [transaction, ...future] = history.future;
  if (!transaction) return history;
  if (transaction.before !== history.document) return history;
  return {
    document: transaction.after,
    past: [...history.past, transaction],
    future,
  };
}
