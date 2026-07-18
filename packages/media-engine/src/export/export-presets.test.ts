import { describe, expect, it } from 'vitest';
import { EXPORT_PRESETS, getExportPreset } from './export-presets.js';

describe('export presets', () => {
  it('exposes unique stable ids and valid encoding profiles', () => {
    expect(new Set(EXPORT_PRESETS.map((preset) => preset.id)).size).toBe(EXPORT_PRESETS.length);
    expect(EXPORT_PRESETS.every((preset) => preset.fps > 0 && preset.crf > 0)).toBe(true);
  });

  it('resolves known presets and rejects unknown ids', () => {
    expect(getExportPreset('shorts-vertical').ok).toBe(true);
    expect(getExportPreset('missing').ok).toBe(false);
  });
});
