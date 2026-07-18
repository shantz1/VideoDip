import { appError, err, ok, type Result } from '@videodip/shared';

export type ExportPresetId =
  | 'tiktok-vertical'
  | 'reels-vertical'
  | 'shorts-vertical'
  | 'social-square'
  | 'landscape-hd';

export interface ExportPreset {
  readonly id: ExportPresetId;
  readonly name: string;
  readonly fps: 30 | 60;
  readonly crf: number;
  readonly encoderPreset: 'veryfast' | 'fast' | 'medium';
  readonly audioBitrate: '128k' | '192k' | '256k';
}

/** Conservative platform presets that remain ordinary editable export data. */
export const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: 'tiktok-vertical',
    name: 'TikTok 1080p',
    fps: 30,
    crf: 18,
    encoderPreset: 'veryfast',
    audioBitrate: '192k',
  },
  {
    id: 'reels-vertical',
    name: 'Instagram Reels 1080p',
    fps: 30,
    crf: 18,
    encoderPreset: 'veryfast',
    audioBitrate: '192k',
  },
  {
    id: 'shorts-vertical',
    name: 'YouTube Shorts 1080p60',
    fps: 60,
    crf: 17,
    encoderPreset: 'fast',
    audioBitrate: '192k',
  },
  {
    id: 'social-square',
    name: 'Social Square',
    fps: 30,
    crf: 18,
    encoderPreset: 'veryfast',
    audioBitrate: '192k',
  },
  {
    id: 'landscape-hd',
    name: 'Landscape Full HD',
    fps: 30,
    crf: 18,
    encoderPreset: 'fast',
    audioBitrate: '192k',
  },
];

/** Resolves a stable preset id without making callers depend on array order. */
export function getExportPreset(id: string): Result<ExportPreset> {
  const preset = EXPORT_PRESETS.find((candidate) => candidate.id === id);
  return preset
    ? ok(preset)
    : err(
        appError('NOT_FOUND', `Export preset ${id} does not exist.`, 'Choose an available preset.'),
      );
}
