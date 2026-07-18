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
  transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  opacity: 1,
  blendMode: 'normal',
  animation: [],
  audio: { volume: 1, isMuted: false, fadeIn: ms(0), fadeOut: ms(0) },
  transitionToNext: null,
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

  it('compiles adjacent transitions without shortening the project duration', () => {
    const args = unwrap(
      buildExportArgs(
        [
          clip({ transitionToNext: { kind: 'wipe-left', duration: ms(500) } }),
          clip({ src: 'C:\\media\\b.mp4' }),
        ],
        SETTINGS,
      ),
    );
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('tpad=stop_mode=clone:stop_duration=0.5');
    expect(graph).toContain('xfade=transition=wipeleft:duration=0.5:offset=5[v]');
    expect(graph).toContain('acrossfade=d=0.5:c1=tri:c2=tri[a]');
    expect(getExportDuration([clip(), clip()])).toBe(10_000);
  });

  it('rejects unsupported plugin transitions instead of exporting a visual lie', () => {
    const result = buildExportArgs(
      [clip({ transitionToNext: { kind: 'plugin:prism', duration: ms(500) } }), clip()],
      SETTINGS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED');
  });

  it('conforms video to the requested geometry and frame rate', () => {
    const args = unwrap(buildExportArgs([clip()], SETTINGS));
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('scale=1080:1920');
    expect(graph).toContain('color=c=black:s=1080x1920');
    expect(graph).toContain('fps=30');
    expect(graph).toContain('settb=AVTB,setpts=N/(30*TB)');
  });

  it('compiles static transform, opacity, volume and fades into the graph', () => {
    const args = unwrap(
      buildExportArgs(
        [
          clip({
            transform: { positionX: 0.1, positionY: -0.2, scaleX: 1.5, scaleY: 0.75, rotation: 15 },
            opacity: 0.5,
            audio: { volume: 0.4, isMuted: false, fadeIn: ms(250), fadeOut: ms(500) },
          }),
        ],
        SETTINGS,
      ),
    );
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('colorchannelmixer=aa=0.5');
    expect(graph).toContain('volume=0.4');
    expect(graph).toContain('afade=t=in:st=0:d=0.25');
    expect(graph).toContain('afade=t=out:st=4.5:d=0.5');
  });

  it('rejects animation and non-normal blend modes instead of exporting a visual lie', () => {
    const animated = clip({
      animation: [{ property: 'opacity', offset: ms(0), value: 0, easing: 'linear' }],
    });
    expect(buildExportArgs([animated], SETTINGS).ok).toBe(false);
    expect(buildExportArgs([clip({ blendMode: 'screen' })], SETTINGS).ok).toBe(false);
  });

  it('emits machine-readable progress and writes to the output path', () => {
    const args = unwrap(buildExportArgs([clip()], SETTINGS));
    expect(args).toContain('-progress');
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
    expect(args[args.length - 1]).toBe('C:\\out\\final.mp4');
    expect(args[args.length - 2]).toBe('-y');
  });
});
