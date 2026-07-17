import type { Milliseconds, Normalized, SegmentId } from '@videodip/shared';

/** One recognized word with absolute project timing. */
export interface SubtitleWord {
  readonly id: string;
  readonly text: string;
  readonly start: Milliseconds;
  readonly end: Milliseconds;
  readonly confidence: Normalized | null;
}

/** Serializable caption styling; null values inherit the active template. */
export interface SubtitleStyle {
  readonly fontFamily: string | null;
  readonly fontSize: number | null;
  readonly foreground: string | null;
  readonly background: string | null;
  readonly isBold: boolean;
  readonly isItalic: boolean;
  readonly isUnderlined: boolean;
  readonly alignment: 'start' | 'center' | 'end';
  readonly positionX: Normalized;
  readonly positionY: Normalized;
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
