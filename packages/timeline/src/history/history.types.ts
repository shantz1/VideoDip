import type { Result } from '@videodip/shared';
import type { TimelineDocument } from '../document/document.types.js';

/** One pure domain edit that can participate in an atomic timeline transaction. */
export type TimelineOperation = (document: TimelineDocument) => Result<TimelineDocument>;

/** User intent and ordered pure operations to apply as one undoable edit. */
export interface TimelineTransactionInput {
  readonly label: string;
  readonly operations: readonly TimelineOperation[];
}

/**
 * One successfully validated user-intent boundary retained by timeline history.
 *
 * Snapshots use the document's structural sharing; the transaction adds intent metadata
 * without replacing existing pure operations with command objects.
 */
export interface TimelineTransaction {
  readonly label: string;
  readonly before: TimelineDocument;
  readonly after: TimelineDocument;
}

/** Current timeline plus undoable and redoable user-intent transactions. */
export interface TimelineHistory {
  readonly document: TimelineDocument;
  readonly past: readonly TimelineTransaction[];
  readonly future: readonly TimelineTransaction[];
}
