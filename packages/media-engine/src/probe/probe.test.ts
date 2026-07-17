import { mediaLocatorSchema } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { buildProbeArgs, parseProbeOutput } from './probe.service.js';

const OUTPUT = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_name: 'h264',
      codec_type: 'video',
      width: 1920,
      height: 1080,
      r_frame_rate: '30000/1001',
      duration: '4.200000',
    },
    {
      index: 1,
      codec_name: 'aac',
      codec_type: 'audio',
      sample_rate: '48000',
      channels: 2,
      duration: '4.200000',
    },
  ],
  format: {
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '4.200000',
    size: '123456',
    bit_rate: '235154',
  },
});

describe('buildProbeArgs', () => {
  it('requests only stable JSON metadata and preserves the locator as one argv entry', () => {
    const locator = mediaLocatorSchema.parse('C:\\media folder\\clip.mp4');
    const args = buildProbeArgs(locator);

    expect(args).toContain('json');
    expect(args.at(-1)).toBe(locator);
  });
});

describe('parseProbeOutput', () => {
  it('normalizes container and stream metadata', () => {
    const result = parseProbeOutput(OUTPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.duration).toBe(4200);
    expect(result.value.sizeBytes).toBe(123456);
    expect(result.value.streams[0]).toMatchObject({
      kind: 'video',
      codec: 'h264',
      width: 1920,
      height: 1080,
    });
    expect(result.value.streams[0]?.fps).toBeCloseTo(29.97, 2);
    expect(result.value.streams[1]).toMatchObject({
      kind: 'audio',
      sampleRate: 48000,
      channels: 2,
    });
  });

  it('falls back to the longest stream duration when the container omits one', () => {
    const result = parseProbeOutput(
      JSON.stringify({ streams: [{ index: 0, codec_type: 'video', duration: '2.5' }] }),
    );
    expect(result.ok && result.value.duration).toBe(2500);
  });

  it('returns recoverable validation errors for malformed or durationless output', () => {
    const malformed = parseProbeOutput('{');
    const durationless = parseProbeOutput(JSON.stringify({ streams: [] }));

    expect(malformed.ok).toBe(false);
    expect(durationless.ok).toBe(false);
    if (!durationless.ok) expect(durationless.error.recovery).toContain('adjusted manually');
  });
});
