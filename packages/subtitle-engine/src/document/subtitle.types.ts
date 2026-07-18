import type { Milliseconds, Normalized, SegmentId } from '@videodip/shared';

/** One recognized word with absolute project timing. */
export interface SubtitleWord {
  readonly id: string;
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly confidence: Normalized | null;
}

/**
 * Fully resolved, serializable caption styling.
 *
 * Cue-level inheritance is represented only by an omitted key in
 * {@link SubtitleSegment.style}. `null` is deliberately not part of this
 * contract: storage migrations normalize legacy nullable values before they
 * reach the domain, and renderers receive a fully resolved instance.
 */
export interface SubtitleStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly isItalic: boolean;
  readonly isUnderlined: boolean;
  readonly letterSpacing: number;
  readonly lineHeight: number;
  readonly foreground: string;
  readonly opacity: Normalized;
  readonly backgroundEnabled: boolean;
  readonly background: string;
  readonly backgroundOpacity: Normalized;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly shadowColor: string;
  readonly shadowBlur: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
  readonly shadowOpacity: Normalized;
  readonly alignment: 'start' | 'center' | 'end';
  readonly maxWidth: Normalized;
  readonly padding: number;
  readonly borderRadius: number;
  readonly positionX: Normalized;
  readonly positionY: Normalized;
  readonly rotation: number;
  readonly scale: number;
  readonly animation: 'none' | 'fade' | 'pop' | 'slide-up';
}

/** One editable subtitle cue and its optional word-level timings. */
export interface SubtitleSegment {
  readonly id: SegmentId;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly text: string;
  readonly words: readonly SubtitleWord[];
  readonly style: Partial<SubtitleStyle>;
  readonly speaker: string | null;
}

/** Complete subtitle document kept separate from timeline presentation state. */
export interface SubtitleDocument {
  readonly version: 1;
  readonly language: string | null;
  readonly segments: readonly SubtitleSegment[];
  readonly defaultStyle: SubtitleStyle;
}

/** Input accepted when inserting a new subtitle cue. */
export interface AddSubtitleSegmentInput {
  readonly id?: SegmentId;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly text: string;
  readonly words?: readonly SubtitleWord[];
  readonly style?: Partial<SubtitleStyle>;
  readonly speaker?: string | null;
}
