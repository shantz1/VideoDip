import type { AssetId, ClipId, Milliseconds, TrackId } from '@videodip/shared';

/**
 * Fixed set of track kinds, matching the desktop shell's three-row timeline.
 *
 * Not user-extensible yet — adding "arbitrary number of tracks" is a real
 * feature (headers, reordering, per-track height) that hasn't been asked for.
 * When it is, this becomes a runtime-configured list rather than a union.
 */
export type TrackKind = 'video' | 'subtitle' | 'audio';

/**
 * A placed instance of a media asset on the timeline.
 *
 * `sourceStart`/`sourceDuration` are the trimmed window *within* the source
 * media; `start`/`duration` are where and how long the clip sits *on the
 * timeline*. Splitting or trimming a clip changes both pairs together —
 * see {@link import('./document.service.js').splitClip}.
 */
export interface Clip {
  readonly id: ClipId;
  readonly trackId: TrackId;
  readonly assetId: AssetId;
  /** Position on the timeline. */
  readonly start: Milliseconds;
  /** Length on the timeline. Always equals `sourceDuration`. */
  readonly duration: Milliseconds;
  /** Offset into the source media where this clip's content begins. */
  readonly sourceStart: Milliseconds;
}

export interface Track {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly label: string;
  readonly clips: readonly Clip[];
}

/**
 * The full editable project document: what this app is actually editing.
 *
 * Deliberately separate from `apps/desktop`'s `editor.store.ts`, which only
 * holds shell/layout state (which panel is open, playhead position). This is
 * the undoable, framework-free half — a document, not a UI concern.
 */
export interface TimelineDocument {
  readonly tracks: readonly Track[];
}
