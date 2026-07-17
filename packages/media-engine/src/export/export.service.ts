import { appError, err, ok, type Milliseconds, type Result } from '@videodip/shared';
import type { ExportClip, ExportSettings } from './export.types.js';

/**
 * Audio sample rate every exported clip is resampled to before concatenation.
 * FFmpeg's concat filter requires identical sample rates across segments;
 * 48 kHz is the video-delivery standard.
 */
const AUDIO_SAMPLE_RATE = 48_000;

/**
 * The export's total output duration: the sum of clip durations.
 *
 * A sum, not the timeline's far edge — v0.1 export concatenates clips
 * back-to-back and drops gaps rather than rendering black. Progress
 * percentages are computed against this value.
 */
export function getExportDuration(clips: readonly ExportClip[]): Milliseconds {
  return clips.reduce((total, clip) => total + clip.duration, 0) as Milliseconds;
}

/** Milliseconds → FFmpeg seconds. Integer ms keeps this exact at 3 decimals. */
function seconds(value: Milliseconds): string {
  return (value / 1000).toString();
}

/**
 * Compiles an ordered clip list into the full FFmpeg argv for one export.
 *
 * Pure — no spawning, no filesystem. The desktop shell hands the returned
 * argv to a Rust command that actually runs FFmpeg; keeping the compilation
 * here means the interesting logic is unit-testable with no FFmpeg installed,
 * and the process-spawning side stays too simple to be wrong.
 *
 * What the generated graph does, per clip: trim the wanted span from the
 * source, reset timestamps, conform video to the output size (scale to fit,
 * pad to fill, square pixels, output fps) and audio to a common sample rate,
 * then concatenate every conformed segment and encode H.264/AAC with
 * `+faststart` so the file streams well when uploaded.
 *
 * Known v0.1 limitation, deliberate until FFmpeg probing lands: every source
 * must contain both a video and an audio stream — a silent screen recording
 * or a bare music track will fail with an FFmpeg stream-matching error
 * rather than silently exporting without sound.
 */
export function buildExportArgs(
  clips: readonly ExportClip[],
  settings: ExportSettings,
): Result<readonly string[]> {
  if (clips.length === 0) {
    return err(
      appError(
        'VALIDATION',
        'Nothing to export: the timeline has no clips.',
        'Add at least one clip to the timeline, then export again.',
      ),
    );
  }
  if (
    clips.some(
      (clip) =>
        clip.src.trim().length === 0 ||
        !Number.isFinite(clip.sourceStart) ||
        clip.sourceStart < 0 ||
        !Number.isFinite(clip.duration) ||
        clip.duration <= 0,
    )
  ) {
    return err(
      appError(
        'VALIDATION',
        'A clip has an invalid source, offset, or duration.',
        'Remove or re-trim the broken clip, then export again.',
      ),
    );
  }
  const { width, height, fps } = settings;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width % 2 !== 0 ||
    height % 2 !== 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  ) {
    return err(
      appError(
        'VALIDATION',
        `Invalid output geometry: ${width}x${height} @ ${fps}fps.`,
        'Pick a standard aspect ratio and frame rate.',
      ),
    );
  }
  if (settings.outputPath.trim().length === 0) {
    return err(
      appError(
        'VALIDATION',
        'The output path is empty.',
        'Choose where to save the exported video, then export again.',
      ),
    );
  }

  const inputs = clips.flatMap((clip) => ['-i', clip.src]);

  const segments = clips.map((clip, i) => {
    const start = seconds(clip.sourceStart);
    const end = seconds((clip.sourceStart + clip.duration) as Milliseconds);
    const video =
      `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`;
    const audio =
      `[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
      `aresample=${AUDIO_SAMPLE_RATE}[a${i}]`;
    return `${video};${audio}`;
  });

  const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
  const filterGraph =
    `${segments.join(';')};` + `${concatInputs}concat=n=${clips.length}:v=1:a=1[v][a]`;

  return ok([
    // Machine-readable progress on stdout for the spawning side; no tty stats.
    '-hide_banner',
    '-nostats',
    '-progress',
    'pipe:1',
    ...inputs,
    '-filter_complex',
    filterGraph,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-y',
    settings.outputPath,
  ]);
}
