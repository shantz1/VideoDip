import {
  appError,
  err,
  ms,
  ok,
  type MediaLocator,
  type Milliseconds,
  type Result,
} from '@videodip/shared';
import { z } from 'zod';
import type { MediaMetadata, MediaStreamMetadata } from '../media/media.types.js';

const rawStreamSchema = z.object({
  index: z.number().int().nonnegative(),
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  duration: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  r_frame_rate: z.string().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().int().positive().optional(),
});

const rawProbeSchema = z.object({
  format: z
    .object({
      format_name: z.string().optional(),
      duration: z.string().optional(),
      size: z.string().optional(),
      bit_rate: z.string().optional(),
    })
    .optional(),
  streams: z.array(rawStreamSchema).default([]),
});

/** Builds deterministic FFprobe arguments for one host-owned local media source. */
export function buildProbeArgs(locator: MediaLocator): readonly string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'format=format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,duration,width,height,r_frame_rate,sample_rate,channels',
    '-of',
    'json',
    String(locator),
  ];
}

/** Parses and validates FFprobe JSON into the stable Media Engine model. */
export function parseProbeOutput(output: string): Result<MediaMetadata> {
  let json: unknown;
  try {
    json = JSON.parse(output) as unknown;
  } catch (cause) {
    return err(
      appError(
        'VALIDATION',
        'FFprobe returned invalid JSON.',
        'Re-import the media or verify that FFmpeg is installed correctly.',
        { cause },
      ),
    );
  }

  const parsed = rawProbeSchema.safeParse(json);
  if (!parsed.success) {
    return err(
      appError(
        'VALIDATION',
        'FFprobe returned an unsupported metadata shape.',
        'Re-import the media or update FFmpeg.',
        { cause: parsed.error },
      ),
    );
  }

  const streams = parsed.data.streams.map(toStreamMetadata);
  const durationSeconds =
    positiveNumber(parsed.data.format?.duration) ??
    streams.reduce<number | null>((longest, stream) => {
      if (stream.duration === null) return longest;
      const seconds = stream.duration / 1000;
      return longest === null ? seconds : Math.max(longest, seconds);
    }, null);

  if (durationSeconds === null) {
    return err(
      appError(
        'VALIDATION',
        'FFprobe did not report a positive media duration.',
        'The file can be imported with unknown duration and adjusted manually.',
      ),
    );
  }

  return ok({
    duration: ms(Math.round(durationSeconds * 1000)),
    format: parsed.data.format?.format_name ?? 'unknown',
    sizeBytes: nonNegativeInteger(parsed.data.format?.size),
    bitrate: nonNegativeInteger(parsed.data.format?.bit_rate),
    streams,
  });
}

function toStreamMetadata(stream: z.output<typeof rawStreamSchema>): MediaStreamMetadata {
  const duration = positiveNumber(stream.duration);
  const fps = rationalNumber(stream.r_frame_rate);
  const sampleRate = positiveInteger(stream.sample_rate);
  return {
    index: stream.index,
    kind:
      stream.codec_type === 'video' ? 'video' : stream.codec_type === 'audio' ? 'audio' : 'other',
    codec: stream.codec_name ?? 'unknown',
    duration: duration === null ? null : ms(Math.round(duration * 1000)),
    ...(stream.width !== undefined ? { width: stream.width } : {}),
    ...(stream.height !== undefined ? { height: stream.height } : {}),
    ...(fps !== null ? { fps } : {}),
    ...(sampleRate !== null ? { sampleRate } : {}),
    ...(stream.channels !== undefined ? { channels: stream.channels } : {}),
  };
}

function positiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: string | undefined): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function rationalNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? '1');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const result = numerator / denominator;
  return result > 0 ? result : null;
}
