import type { Milliseconds } from '@videodip/shared';

/**
 * Formats a time as `MM:SS.cc`, or `H:MM:SS.cc` past an hour.
 *
 * Centiseconds rather than milliseconds: three digits of jitter during
 * playback is visual noise, and two is enough to place a cut by eye. Frame
 * numbers would be better still, but that needs the project's frame rate —
 * see `msToFrames` in `@videodip/shared`, which requires an explicit `Fps`
 * precisely so this conversion can't be done by accident.
 *
 * Pair with `tabular-nums` when rendering; proportional digits make the
 * timecode jitter as it counts.
 *
 * @example
 * ```ts
 * formatTimecode(ms(65_432)) // '01:05.43'
 * ```
 */
export function formatTimecode(time: Milliseconds): string {
  const clamped = Math.max(0, time);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((clamped % 1000) / 10);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const tail = `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;

  return hours > 0 ? `${hours}:${tail}` : tail;
}
