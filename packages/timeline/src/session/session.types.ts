import type { ClipId, SegmentId, TrackId, TransitionId } from '@videodip/shared';
import type { ClipTransform } from '../document/document.types.js';

/**
 * One selectable timeline item, identified by kind and branded ID.
 *
 * A discriminated union instead of parallel nullable fields makes exclusivity
 * of selection structural (one field cannot reference two items), and Phase
 * 3's SelectionSet reuses this ref type as its element type unchanged.
 *
 * `subtitle-segment` refers to an item of the separate SubtitleDocument
 * aggregate; the timeline session can hold the reference (the ID brand lives
 * in @videodip/shared) but cannot resolve it on its own — see
 * `SessionReconcileGuards`.
 */
export type TimelineSelectionRef =
  | { readonly type: 'clip'; readonly id: ClipId }
  | { readonly type: 'transition'; readonly id: TransitionId }
  | { readonly type: 'subtitle-segment'; readonly id: SegmentId };

/**
 * Zero or more selected timeline items, with two distinguished members.
 *
 * `refs` is insertion-ordered (for `toggleSessionSelection`) or a sliced
 * sub-range of a caller-supplied order (for `extendSessionSelection`).
 * `primary` is the ref property panels and single-item actions (split,
 * inspector) target — always the most recently interacted-with member, or
 * `null` for an empty set. `anchor` is the pivot a shift+click range is
 * computed from; unlike `primary` it does not move on a plain shift+click,
 * so successive range-extends all anchor to the same starting ref. Both are
 * members of `refs` or both `null` by construction — see `session.service.ts`.
 */
export interface SelectionSet {
  readonly refs: readonly TimelineSelectionRef[];
  readonly primary: TimelineSelectionRef | null;
  readonly anchor: TimelineSelectionRef | null;
}

/**
 * The editing tool that interprets pointer input on the timeline.
 *
 * A single-member union today because only selection/direct manipulation
 * exists. Future tools extend this union; consumers must switch
 * exhaustively so a new member is a compile error, not a silent fallthrough.
 */
export type TimelineTool = 'select';

/**
 * How the timeline is currently viewed.
 *
 * `zoom` is pixels per second of timeline content — the same unit the ruler
 * and clip layout already use. `isSnappingEnabled` gates snap correction
 * during move/trim gestures; the snap targets themselves are computed by the
 * UI (and later by the drag engine), not stored here.
 *
 * Horizontal scroll offset is deliberately absent: it remains native DOM
 * scroll state until a future virtualized viewport needs it controlled.
 */
export interface EditingSessionViewport {
  readonly zoom: number;
  readonly isSnappingEnabled: boolean;
}

/**
 * A renderer-only clip transform produced during direct manipulation.
 *
 * It is intentionally ephemeral: pointer movement updates this preview while
 * pointer release commits the final transform through a document operation.
 */
export interface ClipTransformPreview {
  readonly clipId: ClipId;
  readonly transform: ClipTransform;
}

/** Non-persisted presentation state for one timeline track row. */
export interface TrackViewState {
  readonly isCollapsed: boolean;
  readonly rowHeight: number;
}

/**
 * Ephemeral, per-open-document editing state.
 *
 * This aggregate is never persisted, never serialized, and never restored
 * across application launches. It has no schema version and no Zod schema by
 * design — the absence is the guarantee. It carries no reference to the
 * TimelineDocument; validity of `selection` against a given document is
 * re-established via `reconcileSession` after every committed change.
 *
 * The clip transform preview is the first direct-manipulation draft. Pointer
 * coordinates and guides stay in the UI because they are view geometry;
 * only the renderer-facing domain transform crosses this boundary. Future
 * concerns remain marquee selection and clipboard state.
 */
export interface EditingSession {
  readonly selection: SelectionSet;
  readonly viewport: EditingSessionViewport;
  readonly activeTool: TimelineTool;
  readonly clipTransformPreview: ClipTransformPreview | null;
  /** UI geometry keyed by track id; never serialized or included in undo. */
  readonly trackViews: Readonly<Record<TrackId, TrackViewState>>;
}

/** Optional overrides for `createEditingSession`; omitted fields use defaults. */
export interface CreateEditingSessionInput {
  /** A single ref to seed the selection with; becomes `refs`, `primary`, and `anchor`. */
  readonly selection?: TimelineSelectionRef | null;
  readonly viewport?: Partial<EditingSessionViewport>;
  readonly activeTool?: TimelineTool;
}

/**
 * Host-supplied existence checks for selection referents the timeline cannot
 * resolve itself. An absent guard means "unknown", and unknown referents are
 * preserved, not dropped.
 */
export interface SessionReconcileGuards {
  readonly hasSubtitleSegment?: (id: SegmentId) => boolean;
}
