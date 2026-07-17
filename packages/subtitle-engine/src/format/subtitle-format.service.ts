import { appError, err, ms, ok, type Result, type SegmentId } from '@videodip/shared';
import { addSubtitleSegment, createSubtitleDocument } from '../document/subtitle.service.js';
import type { SubtitleDocument, SubtitleSegment } from '../document/subtitle.types.js';
import type { SubtitleExportOptions, SubtitleFormat } from './subtitle-format.types.js';

const TIMESTAMP_PATTERN = /^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/;
const VTT_TIMING_PATTERN = /^([^\s]+)\s+-->\s+([^\s]+)(?:\s+.*)?$/;
const ASS_DIALOGUE_FIELDS = 10;

/** Parses validated SRT, WebVTT, or ASS text into a host-neutral document. */
export function parseSubtitle(
  source: string,
  format: SubtitleFormat,
  language: string | null = null,
): Result<SubtitleDocument> {
  if (!source.trim()) {
    return err(
      appError('VALIDATION', 'Subtitle file is empty.', 'Choose a subtitle file containing cues.'),
    );
  }
  if (source.length > 20_000_000) {
    return err(
      appError(
        'VALIDATION',
        'Subtitle file exceeds the safe import size.',
        'Choose a smaller file.',
      ),
    );
  }

  const parsed = format === 'ass' ? parseAss(source) : parseBlockFormat(source, format);
  if (!parsed.ok) return parsed;
  return buildDocument(parsed.value, language);
}

/** Serializes a subtitle document to SRT, WebVTT, or ASS. */
export function exportSubtitle(
  document: SubtitleDocument,
  format: SubtitleFormat,
  options: SubtitleExportOptions = {},
): Result<string> {
  const validated = buildDocument(document.segments, document.language);
  if (!validated.ok) return validated;
  if (format === 'vtt') return ok(exportVtt(validated.value));
  if (format === 'ass') return ok(exportAss(validated.value, options));
  return ok(exportSrt(validated.value));
}

function parseBlockFormat(
  source: string,
  format: 'srt' | 'vtt',
): Result<readonly SubtitleSegment[]> {
  const normalizedSource = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const body = format === 'vtt' ? stripVttHeader(normalizedSource) : normalizedSource;
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const segments: SubtitleSegment[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const match = VTT_TIMING_PATTERN.exec(lines[timingIndex]?.trim() ?? '');
    if (!match) return invalidCue('A subtitle cue has an invalid timing line.');
    const start = parseTimestamp(match[1] ?? '');
    const end = parseTimestamp(match[2] ?? '');
    if (start === null || end === null)
      return invalidCue('A subtitle cue has an invalid timestamp.');
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (!text) return invalidCue('A subtitle cue has no text.');
    segments.push(createParsedSegment(start, end, decodeText(text, format)));
  }

  if (segments.length === 0) return invalidCue('No subtitle cues were found.');
  return ok(segments);
}

function parseAss(source: string): Result<readonly SubtitleSegment[]> {
  const segments: SubtitleSegment[] = [];
  for (const rawLine of source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    if (!/^Dialogue\s*:/i.test(rawLine)) continue;
    const payload = rawLine.slice(rawLine.indexOf(':') + 1).trim();
    const fields = splitAssDialogue(payload);
    if (fields.length < ASS_DIALOGUE_FIELDS) {
      return invalidCue('An ASS dialogue row has too few fields.');
    }
    const start = parseAssTimestamp(fields[1] ?? '');
    const end = parseAssTimestamp(fields[2] ?? '');
    if (start === null || end === null)
      return invalidCue('An ASS dialogue row has invalid timing.');
    const styleName = (fields[3] ?? '').trim();
    const speaker = (fields[4] ?? '').trim() || null;
    const text = decodeAssText(fields.slice(9).join(','));
    segments.push({
      ...createParsedSegment(start, end, text),
      speaker,
      style: styleName && styleName.toLowerCase() !== 'default' ? { fontFamily: styleName } : {},
    });
  }
  if (segments.length === 0) return invalidCue('No ASS dialogue rows were found.');
  return ok(segments);
}

function buildDocument(
  segments: readonly SubtitleSegment[],
  language: string | null,
): Result<SubtitleDocument> {
  let document = createSubtitleDocument(language);
  for (const segment of segments) {
    const result = addSubtitleSegment(document, segment);
    if (!result.ok) return result;
    document = result.value;
  }
  return ok(document);
}

function exportSrt(document: SubtitleDocument): string {
  return `${document.segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatTimestamp(segment.start, ',')} --> ${formatTimestamp(segment.end, ',')}\n${encodeText(segment.text)}`,
    )
    .join('\n\n')}\n`;
}

function exportVtt(document: SubtitleDocument): string {
  const language = document.language ? `\nLanguage: ${document.language}` : '';
  const cues = document.segments
    .map(
      (segment) =>
        `${segment.id}\n${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(segment.end, '.')}\n${encodeText(segment.text)}`,
    )
    .join('\n\n');
  return `WEBVTT${language}\n\n${cues}${cues ? '\n' : ''}`;
}

function exportAss(document: SubtitleDocument, options: SubtitleExportOptions): string {
  const title = sanitizeAssMetadata(options.title ?? 'VideoDip subtitles');
  const language = sanitizeAssMetadata(options.language ?? document.language ?? 'und');
  const dialogue = document.segments
    .map((segment) => {
      const speaker = sanitizeAssField(segment.speaker ?? '');
      return `Dialogue: 0,${formatAssTimestamp(segment.start)},${formatAssTimestamp(segment.end)},Default,${speaker},0,0,0,,${encodeAssText(segment.text)}`;
    })
    .join('\n');
  return `[Script Info]\nTitle: ${title}\nLanguage: ${language}\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogue}${dialogue ? '\n' : ''}`;
}

function createParsedSegment(start: number, end: number, text: string): SubtitleSegment {
  return {
    id: crypto.randomUUID() as SegmentId,
    start: ms(start),
    end: ms(end),
    text,
    words: [],
    style: {},
    speaker: null,
  };
}

function parseTimestamp(value: string): number | null {
  const pieces = value.trim().split(':');
  const normalizedValue = pieces.length === 2 ? `00:${value.trim()}` : value.trim();
  const match = TIMESTAMP_PATTERN.exec(normalizedValue);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = (match[4] ?? '').padEnd(3, '0').slice(0, 3);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(fraction);
}

function parseAssTimestamp(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)[.](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  return (
    ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 +
    Number((match[4] ?? '').padEnd(2, '0')) * 10
  );
}

function formatTimestamp(value: number, separator: ',' | '.'): string {
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const milliseconds = total % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${separator}${pad(milliseconds, 3)}`;
}

function formatAssTimestamp(value: number): string {
  const totalCentiseconds = Math.max(0, Math.round(value / 10));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(totalCentiseconds % 100, 2)}`;
}

function stripVttHeader(source: string): string {
  if (!/^WEBVTT(?:\s|$)/i.test(source)) return source;
  const blankLine = source.indexOf('\n\n');
  return blankLine < 0 ? '' : source.slice(blankLine + 2);
}

function splitAssDialogue(payload: string): string[] {
  const fields: string[] = [];
  let remainder = payload;
  for (let index = 0; index < ASS_DIALOGUE_FIELDS - 1; index += 1) {
    const comma = remainder.indexOf(',');
    if (comma < 0) return fields;
    fields.push(remainder.slice(0, comma));
    remainder = remainder.slice(comma + 1);
  }
  fields.push(remainder);
  return fields;
}

function encodeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function decodeText(text: string, format: 'srt' | 'vtt'): string {
  if (format === 'srt') return text;
  return text
    .replace(/<v\s+[^>]+>/gi, '')
    .replace(/<\/v>/gi, '')
    .trim();
}

function encodeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\u005c')
    .replace(/\r\n?|\n/g, '\\N')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

function decodeAssText(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\\u005c/g, '\\')
    .trim();
}

function sanitizeAssField(value: string): string {
  return value.replace(/[\r\n,]/g, ' ').trim();
}

function sanitizeAssMetadata(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim();
}

function pad(value: number, width: number): string {
  return Math.trunc(value).toString().padStart(width, '0');
}

function invalidCue(message: string): Result<never> {
  return err(appError('VALIDATION', message, 'Correct the subtitle file and import it again.'));
}
