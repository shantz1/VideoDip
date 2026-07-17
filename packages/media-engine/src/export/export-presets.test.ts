import { describe, expect, it } from 'vitest';
import { EXPORT_PRESETS, getExportPreset } from './export-presets.js';

describe('export presets', () => {
  it('exposes unique stable ids and even H.264 dimensions', () => {
    expect(new Set(EXPORT_PRESETS.map((preset) => preset.id)).size).toBe(EXPORT_PRESETS.length);
    expect(
      EXPORT_PRESETS.every((preset) => preset.width % 2 === 0 && preset.height % 2 === 0),
    ).toBe(true);
  });

  it('resolves known presets and rejects unknown ids', () => {
    expect(getExportPreset('shorts-vertical').ok).toBe(true);
    expect(getExportPreset('missing').ok).toBe(false);
  });
});
