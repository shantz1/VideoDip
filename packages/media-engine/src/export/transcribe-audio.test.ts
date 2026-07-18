import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import {
  buildTimelineAudioArgs,
  getTimelineAudioDuration,
  type TimelineAudioClip,
} from './transcribe-audio.js';

const clip = (overrides: Partial<TimelineAudioClip> = {}): TimelineAudioClip => ({
  src: 'C:\\media\\a.mp4',
  sourceStart: ms(0),
  duration: ms(2000),
  start: ms(0),
  volume: 1,
  isMuted: false,
  ...overrides,
});

function unwrap(result: ReturnType<typeof buildTimelineAudioArgs>): readonly string[] {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('getTimelineAudioDuration', () => {
  it('is the far edge across placed clips, not the sum', () => {
    expect(
      getTimelineAudioDuration([
        clip({ start: ms(0), duration: ms(2000) }),
        clip({ start: ms(5000), duration: ms(1000) }),
      ]),
    ).toBe(6000);
  });
});

describe('buildTimelineAudioArgs', () => {
  it('delays each clip to its timeline position so gaps survive as silence', () => {
    const args = unwrap(
      buildTimelineAudioArgs(
        [clip(), clip({ src: 'C:\\media\\b.mp4', start: ms(5000), sourceStart: ms(250) })],
        'C:\\temp\\mix.wav',
      ),
    );
    const graph = args[args.indexOf('-filter_complex') + 1] ?? '';

    expect(graph).toContain('atrim=start=0:end=2');
    expect(graph).toContain('atrim=start=0.25:end=2.25');
    expect(graph).toContain('adelay=5000:all=1');
    expect(graph).toContain('amix=inputs=2:duration=longest:normalize=0[a]');
    expect(args).toContain('pcm_s16le');
    expect(args.at(-1)).toBe('C:\\temp\\mix.wav');
  });

  it('skips the mixer for a single clip', () => {
    const graph = unwrap(buildTimelineAudioArgs([clip()], 'C:\\temp\\mix.wav')).join(' ');
    expect(graph).not.toContain('amix');
    expect(graph).toContain('[a0]anull[a]');
  });

  it('drops muted and silent clips before mixing', () => {
    const args = unwrap(
      buildTimelineAudioArgs(
        [clip(), clip({ src: 'C:\\media\\muted.mp4', isMuted: true }), clip({ volume: 0 })],
        'C:\\temp\\mix.wav',
      ),
    );
    expect(args.filter((value) => value === '-i')).toHaveLength(1);
  });

  it('errors when every clip is inaudible, with a recovery path', () => {
    const result = buildTimelineAudioArgs([clip({ isMuted: true })], 'C:\\temp\\mix.wav');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.recovery).toContain('Unmute');
  });

  it('rejects invalid clip geometry', () => {
    expect(buildTimelineAudioArgs([clip({ duration: ms(0) })], 'C:\\x.wav').ok).toBe(false);
    expect(buildTimelineAudioArgs([clip({ sourceStart: ms(-1) })], 'C:\\x.wav').ok).toBe(false);
    expect(buildTimelineAudioArgs([clip({ src: ' ' })], 'C:\\x.wav').ok).toBe(false);
    expect(buildTimelineAudioArgs([clip()], ' ').ok).toBe(false);
  });
});
