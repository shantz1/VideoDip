import type { Milliseconds } from '@videodip/shared';

/**
 * One clip in the flat, ordered list an export renders.
 *
 * Deliberately not the timeline's `Clip`: export consumes a resolved view —
 * absolute file paths instead of asset ids, and only the clips that actually
 * render. Building that view is the caller's job (the desktop shell maps
 * asset ids to paths; a future headless CLI would read them from a project
 * archive). Keeping the type flat also keeps this package free of any
 * dependency on the timeline package.
 */
export interface ExportClip {
  /** Absolute path to the source media file on the user's machine. */
  readonly src: string;
  /** Offset into the source media where this clip's content begins. */
  readonly sourceStart: Milliseconds;
  /** How much of the source this clip plays. Must be positive. */
  readonly duration: Milliseconds;
}

/**
 * Output geometry and destination for one export.
 *
 * Width/height/fps come from the project's aspect ratio and frame rate; the
 * output path comes from a save dialog. All are decided before the export
 * starts — there is no mid-export renegotiation.
 */
export interface ExportSettings {
  /** Output frame width in pixels. Must be a positive even number (H.264 4:2:0 requirement). */
  readonly width: number;
  /** Output frame height in pixels. Must be a positive even number. */
  readonly height: number;
  /** Output frame rate. */
  readonly fps: number;
  /** Absolute path the encoded file is written to. Overwritten if it exists. */
  readonly outputPath: string;
}
