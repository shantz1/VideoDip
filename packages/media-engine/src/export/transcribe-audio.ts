import { appError, err, ok, type Milliseconds, type Result } from '@videodip/shared';

/**
 * One audible clip as placed on the timeline, for speech recognition.
 *
 * Unlike `ExportClip`, position matters here: transcription of the flattened
 * mix must yield timestamps in timeline time, so gaps stay gaps and every
 * clip is delayed to its real `start`.
 */
export interface TimelineAudioClip {
  readonly src: string;
  /** Offset into the source media where this clip's content begins. */
  readonly sourceStart: Milliseconds;
  readonly duration: Milliseconds;
  /** Position on the timeline the clip's audio must be delayed to. */
  readonly start: Milliseconds;
  readonly volume: number;
  readonly isMuted: boolean;
}

/** Whisper's native input rate; resampling here keeps the mix cheap to convert. */
const SPEECH_SAMPLE_RATE = 16_000;

/** Milliseconds → FFmpeg seconds. Integer ms keeps this exact at 3 decimals. */
function seconds(value: Milliseconds): string {
  return (value / 1000).toString();
}

/** The far edge of the mixed audio — drives progress percentages. */
export function getTimelineAudioDuration(clips: readonly TimelineAudioClip[]): Milliseconds {
  return clips.reduce(
    (total, clip) => Math.max(total, clip.start + clip.duration),
    0,
  ) as Milliseconds;
}

/**
 * Compiles the timeline's audible clips into the FFmpeg argv that flattens
 * them to one mono 16 kHz WAV — what the whole-timeline transcription mode
 * feeds Whisper (the same rate whisper-cli converts to anyway).
 *
 * Pure, like {@link buildExportArgs}: argv construction stays testable here
 * and the Rust process runner stays generic. Muted and zero-volume clips are
 * dropped before compilation — transcribing what the timeline cannot be
 * heard saying would caption sounds the export won't contain.
 */
export function buildTimelineAudioArgs(
  clips: readonly TimelineAudioClip[],
  outputPath: string,
): Result<readonly string[]> {
  const audible = clips.filter((clip) => !clip.isMuted && clip.volume > 0);
  if (audible.length === 0) {
    return err(
      appError(
        'VALIDATION',
        'The timeline has no audible clips to transcribe.',
        'Unmute at least one clip with speech, then generate subtitles again.',
      ),
    );
  }
  if (
    audible.some(
      (clip) =>
        clip.src.trim().length === 0 ||
        !Number.isFinite(clip.sourceStart) ||
        clip.sourceStart < 0 ||
        !Number.isFinite(clip.duration) ||
        clip.duration <= 0 ||
        !Number.isFinite(clip.start) ||
        clip.start < 0 ||
        !Number.isFinite(clip.volume) ||
        clip.volume < 0 ||
        clip.volume > 1,
    )
  ) {
    return err(
      appError(
        'VALIDATION',
        'A clip has an invalid source, offset, or duration.',
        'Remove or re-trim the broken clip, then generate subtitles again.',
      ),
    );
  }
  if (outputPath.trim().length === 0) {
    return err(
      appError(
        'VALIDATION',
        'The transcription audio path is empty.',
        'Retry generating subtitles.',
      ),
    );
  }

  const inputs = audible.flatMap((clip) => ['-i', clip.src]);
  const segments = audible.map((clip, i) => {
    const start = seconds(clip.sourceStart);
    const end = seconds((clip.sourceStart + clip.duration) as Milliseconds);
    // adelay takes whole milliseconds; all=1 covers every channel.
    const delay = clip.start > 0 ? `,adelay=${Math.round(clip.start)}:all=1` : '';
    return (
      `[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
      `aresample=${SPEECH_SAMPLE_RATE},volume=${clip.volume}${delay}[a${i}]`
    );
  });
  const mix =
    audible.length === 1
      ? `[a0]anull[a]`
      : `${audible.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audible.length}:duration=longest:normalize=0[a]`;

  return ok([
    '-hide_banner',
    '-nostats',
    '-progress',
    'pipe:1',
    ...inputs,
    '-filter_complex',
    `${segments.join(';')};${mix}`,
    '-map',
    '[a]',
    '-ac',
    '1',
    '-ar',
    String(SPEECH_SAMPLE_RATE),
    '-c:a',
    'pcm_s16le',
    '-y',
    outputPath,
  ]);
}
