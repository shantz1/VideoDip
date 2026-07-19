import { appError, err, ok, type Milliseconds, type Result } from '@videodip/shared';
import type { ExportClip, ExportSettings } from './export.types.js';

/**
 * Audio sample rate every exported clip is resampled to before concatenation.
 * FFmpeg's concat filter requires identical sample rates across segments;
 * 48 kHz is the video-delivery standard.
 */
const AUDIO_SAMPLE_RATE = 48_000;

const FFMPEG_TRANSITIONS: Readonly<Record<string, string>> = {
  crossfade: 'fade',
  'dip-to-black': 'fadeblack',
  'dip-to-white': 'fadewhite',
  'slide-left': 'slideleft',
  'slide-right': 'slideright',
  'slide-up': 'slideup',
  'slide-down': 'slidedown',
  'wipe-left': 'wipeleft',
  'wipe-right': 'wiperight',
  'wipe-up': 'wipeup',
  'wipe-down': 'wipedown',
  'zoom-in': 'zoomin',
  'circle-open': 'circleopen',
  'diagonal-top-left': 'diagtl',
  'diagonal-bottom-right': 'diagbr',
};

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
        clip.duration <= 0 ||
        !Number.isFinite(clip.opacity) ||
        clip.opacity < 0 ||
        clip.opacity > 1 ||
        !Number.isFinite(clip.audio.volume) ||
        clip.audio.volume < 0 ||
        clip.audio.volume > 1 ||
        clip.audio.fadeIn < 0 ||
        clip.audio.fadeOut < 0 ||
        clip.audio.fadeIn > clip.duration ||
        clip.audio.fadeOut > clip.duration,
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
  if (clips.some((clip) => clip.animation.length > 0 || clip.blendMode !== 'normal')) {
    return err(
      appError(
        'UNSUPPORTED',
        'The native FFmpeg path cannot yet reproduce animation or non-normal blend modes.',
        'Clear clip animation and use Normal blend mode, or export through the headless renderer when available.',
      ),
    );
  }
  for (const [index, clip] of clips.entries()) {
    const transition = clip.transitionToNext;
    if (!transition) continue;
    const next = clips[index + 1];
    if (
      !next ||
      !Number.isFinite(transition.duration) ||
      transition.duration <= 0 ||
      transition.duration > Math.min(clip.duration, next.duration)
    ) {
      return err(
        appError(
          'VALIDATION',
          'An export transition does not fit its adjacent clips.',
          'Shorten or remove the transition, then export again.',
        ),
      );
    }
    if (!FFMPEG_TRANSITIONS[transition.kind]) {
      return err(
        appError(
          'UNSUPPORTED',
          `The native exporter cannot render transition "${transition.kind}".`,
          'Choose a built-in transition or use a plugin-capable headless renderer.',
        ),
      );
    }
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
  const crf = settings.crf ?? 18;
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    return err(
      appError('VALIDATION', 'Export quality is out of range.', 'Choose CRF 0 through 51.'),
    );
  }

  const inputs = clips.flatMap((clip) => ['-i', clip.src]);

  const segments = clips.map((clip, i) => {
    const start = seconds(clip.sourceStart);
    const transitionDuration = clip.transitionToNext?.duration ?? (0 as Milliseconds);
    const renderDuration = (clip.duration + transitionDuration) as Milliseconds;
    const end = seconds((clip.sourceStart + renderDuration) as Milliseconds);
    const videoExtension =
      transitionDuration > 0
        ? `,tpad=stop_mode=clone:stop_duration=${seconds(transitionDuration)},trim=duration=${seconds(renderDuration)},setpts=PTS-STARTPTS`
        : '';
    const audioExtension =
      transitionDuration > 0
        ? `,apad=pad_dur=${seconds(transitionDuration)},atrim=duration=${seconds(renderDuration)},asetpts=PTS-STARTPTS`
        : '';
    const angle = (clip.transform.rotation * Math.PI) / 180;
    const x = `(W-w)/2+${clip.transform.positionX}*W`;
    const y = `(H-h)/2+${clip.transform.positionY}*H`;
    const video =
      `color=c=black:s=${width}x${height}:r=${fps}:d=${seconds(renderDuration)},` +
      `settb=AVTB,setpts=N/(${fps}*TB)[base${i}];` +
      `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
      `${videoExtension ? videoExtension.slice(1) + ',' : ''}` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `scale=w='max(2,trunc(iw*${clip.transform.scaleX}/2)*2)':` +
      `h='max(2,trunc(ih*${clip.transform.scaleY}/2)*2)',` +
      `rotate=${angle}:ow=rotw(iw):oh=roth(ih):c=none,format=rgba,` +
      `colorchannelmixer=aa=${clip.opacity},fps=${fps},` +
      `settb=AVTB,setpts=N/(${fps}*TB)[fg${i}];` +
      `[base${i}][fg${i}]overlay=x='${x}':y='${y}':shortest=1,setsar=1,` +
      `fps=${fps},settb=AVTB,setpts=N/(${fps}*TB)[v${i}]`;
    const volume = clip.audio.isMuted ? 0 : clip.audio.volume;
    const fadeIn = clip.audio.fadeIn > 0 ? `,afade=t=in:st=0:d=${seconds(clip.audio.fadeIn)}` : '';
    const fadeOut =
      clip.audio.fadeOut > 0
        ? `,afade=t=out:st=${seconds((clip.duration - clip.audio.fadeOut) as Milliseconds)}:d=${seconds(clip.audio.fadeOut)}`
        : '';
    const audio =
      `[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
      `${audioExtension ? audioExtension.slice(1) + ',' : ''}` +
      `aresample=${AUDIO_SAMPLE_RATE},volume=${volume}${fadeIn}${fadeOut}[a${i}]`;
    return `${video};${audio}`;
  });

  const joinGraph = buildJoinGraph(clips);
  const filterGraph = `${segments.join(';')};${joinGraph}`;

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
    settings.encoderPreset ?? 'veryfast',
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    settings.audioBitrate ?? '192k',
    '-movflags',
    '+faststart',
    '-y',
    settings.outputPath,
  ]);
}

function buildJoinGraph(clips: readonly ExportClip[]): string {
  if (!clips.some((clip) => clip.transitionToNext)) {
    const concatInputs = clips.map((_, index) => `[v${index}][a${index}]`).join('');
    return `${concatInputs}concat=n=${clips.length}:v=1:a=1[v][a]`;
  }

  const operations: string[] = [];
  let currentVideo = 'v0';
  let currentAudio = 'a0';
  let cumulativeDuration = clips[0]?.duration ?? (0 as Milliseconds);
  for (let index = 0; index < clips.length - 1; index += 1) {
    const clip = clips[index];
    const nextIndex = index + 1;
    if (!clip) continue;
    const isLast = nextIndex === clips.length - 1;
    const outputVideo = isLast ? 'v' : `vj${nextIndex}`;
    const outputAudio = isLast ? 'a' : `aj${nextIndex}`;
    const transition = clip.transitionToNext;
    if (transition) {
      const ffmpegKind = FFMPEG_TRANSITIONS[transition.kind] ?? 'fade';
      operations.push(
        `[${currentVideo}][v${nextIndex}]xfade=transition=${ffmpegKind}:duration=${seconds(transition.duration)}:offset=${seconds(cumulativeDuration)}[${outputVideo}]`,
        `[${currentAudio}][a${nextIndex}]acrossfade=d=${seconds(transition.duration)}:c1=tri:c2=tri[${outputAudio}]`,
      );
    } else {
      operations.push(
        `[${currentVideo}][${currentAudio}][v${nextIndex}][a${nextIndex}]concat=n=2:v=1:a=1[${outputVideo}][${outputAudio}]`,
      );
    }
    currentVideo = outputVideo;
    currentAudio = outputAudio;
    cumulativeDuration = (cumulativeDuration + (clips[nextIndex]?.duration ?? 0)) as Milliseconds;
  }
  return operations.join(';');
}
