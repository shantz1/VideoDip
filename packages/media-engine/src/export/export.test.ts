import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { buildExportArgs, getExportDuration } from './export.service.js';
import type { ExportClip, ExportSettings } from './export.types.js';

const SETTINGS: ExportSettings = {
  width: 1080,
  height: 1920,
  fps: 30,
  outputPath: 'C:\\out\\final.mp4',
};

const clip = (overrides: Partial<ExportClip> = {}): ExportClip => ({
  src: 'C:\\media\\a.mp4',
  sourceStart: ms(0),
  duration: ms(5000),
  ...overrides,
});

function unwrap<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got error: ${result.error.message}`);
  return result.value;
}

describe('getExportDuration', () => {
  it('is zero for no clips', () => {
    expect(getExportDuration([])).toBe(0);
  });

  it('sums clip durations, ignoring their timeline gaps', () => {
    expect(getExportDuration([clip(), clip({ duration: ms(2500) })])).toBe(7500);
  });
});

describe('buildExportArgs', () => {
  it('rejects an empty clip list with a recovery path', () => {
    const result = buildExportArgs([], SETTINGS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.recovery).toContain('Add at least one clip');
    }
  });

  it('rejects a zero-duration clip', () => {
    const result = buildExportArgs([clip({ duration: ms(0) })], SETTINGS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects non-finite or negative source timing and empty locators', () => {
    const invalidClips = [
      clip({ sourceStart: ms(-1) }),
      clip({ duration: ms(Number.NaN) }),
      clip({ src: '   ' }),
    ];

    for (const invalidClip of invalidClips) {
      const result = buildExportArgs([invalidClip], SETTINGS);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects non-finite frame rates and an empty output path', () => {
    const invalidSettings = [
      { ...SETTINGS, fps: Number.POSITIVE_INFINITY },
      { ...SETTINGS, outputPath: '   ' },
    ];

    for (const settings of invalidSettings) {
      const result = buildExportArgs([clip()], settings);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects odd output dimensions (H.264 4:2:0 requires even)', () => {
    const result = buildExportArgs([clip()], { ...SETTINGS, width: 1081 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('lists every source as an -i input, in clip order', () => {
    const args = unwrap(buildExportArgs([clip(), clip({ src: 'C:\\media\\b.mp4' })], SETTINGS));
    const inputs = args
      .map((arg, i) => (arg === '-i' ? args[i + 1] : null))
      .filter((path): path is string => path !== null);
    expect(inputs).toEqual(['C:\\media\\a.mp4', 'C:\\media\\b.mp4']);
  });

  it('trims each clip by source offsets expressed in seconds', () => {
    const args = unwrap(
      buildExportArgs([clip({ sourceStart: ms(1500), duration: ms(2250) })], SETTINGS),
    );
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('trim=start=1.5:end=3.75');
    expect(graph).toContain('atrim=start=1.5:end=3.75');
  });

  it('concatenates all clips and maps the joined streams', () => {
    const args = unwrap(buildExportArgs([clip(), clip(), clip()], SETTINGS));
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('concat=n=3:v=1:a=1[v][a]');
    expect(args).toContain('[v]');
    expect(args).toContain('[a]');
  });

  it('conforms video to the requested geometry and frame rate', () => {
    const args = unwrap(buildExportArgs([clip()], SETTINGS));
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('scale=1080:1920');
    expect(graph).toContain('pad=1080:1920');
    expect(graph).toContain('fps=30');
  });

  it('emits machine-readable progress and writes to the output path', () => {
    const args = unwrap(buildExportArgs([clip()], SETTINGS));
    expect(args).toContain('-progress');
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
    expect(args[args.length - 1]).toBe('C:\\out\\final.mp4');
    expect(args[args.length - 2]).toBe('-y');
  });
});
