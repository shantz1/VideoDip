/** Subtitle interchange formats supported by VideoDip. */
export type SubtitleFormat = 'srt' | 'vtt' | 'ass';

/** Optional information used when serializing a subtitle document. */
export interface SubtitleExportOptions {
  readonly title?: string;
  readonly language?: string;
}
