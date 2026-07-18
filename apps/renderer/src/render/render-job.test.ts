import { describe, expect, it } from 'vitest';
import { formatProgressLine, overallProgress, parseRenderJob } from './render-job.js';

const validJob = {
  props: {
    clips: [],
    subtitles: [],
    settings: { fps: 30, width: 1080, height: 1920, durationInFrames: 90 },
  },
  outputPath: 'C:/exports/out.mp4',
};

describe('parseRenderJob', () => {
  it('accepts a minimal valid job', () => {
    const result = parseRenderJob(JSON.stringify(validJob));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.job.outputPath).toBe('C:/exports/out.mp4');
  });

  it('accepts the optional runtime tuning fields', () => {
    const result = parseRenderJob(
      JSON.stringify({
        ...validJob,
        bundleDir: 'C:/bundle',
        browserExecutable: 'C:/chrome/headless.exe',
        concurrency: 4,
        timeoutInMilliseconds: 120_000,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-JSON with a readable error, not an exception', () => {
    const result = parseRenderJob('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('rejects a job with no output path and names the field', () => {
    const { outputPath: _omitted, ...withoutOutput } = validJob;
    const result = parseRenderJob(JSON.stringify(withoutOutput));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('outputPath');
  });

  it('rejects unknown keys so a stale desktop build fails loudly', () => {
    const result = parseRenderJob(JSON.stringify({ ...validJob, surprise: true }));
    expect(result.ok).toBe(false);
  });

  it('rejects composition props that violate the shared schema', () => {
    const result = parseRenderJob(
      JSON.stringify({
        ...validJob,
        props: { ...validJob.props, settings: { ...validJob.props.settings, fps: 0 } },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('props.settings.fps');
  });
});

describe('progress protocol', () => {
  it('formats and clamps the machine-readable line', () => {
    expect(formatProgressLine(0.5)).toBe('progress=0.5000');
    expect(formatProgressLine(-1)).toBe('progress=0.0000');
    expect(formatProgressLine(7)).toBe('progress=1.0000');
  });

  it('keeps the two stages monotonic on one scale', () => {
    expect(overallProgress('bundle', 0)).toBe(0);
    expect(overallProgress('bundle', 1)).toBeCloseTo(0.1);
    expect(overallProgress('render', 0)).toBeCloseTo(0.1);
    expect(overallProgress('render', 1)).toBe(1);
  });
});
