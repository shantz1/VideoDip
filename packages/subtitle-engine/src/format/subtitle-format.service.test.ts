import { ms, type SegmentId } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { addSubtitleSegment, createSubtitleDocument } from '../document/index.js';
import { exportSubtitle, parseSubtitle } from './subtitle-format.service.js';

describe('subtitle interchange', () => {
  it('parses tolerant SRT timestamps and multiline Unicode text', () => {
    const result = parseSubtitle(
      '1\r\n00:00:00.000 --> 00:00:01,250\r\nनमस्ते\r\nworld\r\n',
      'srt',
      'hi',
    );
    const document = unwrap(result);
    expect(document.language).toBe('hi');
    expect(document.segments[0]).toMatchObject({ start: 0, end: 1250, text: 'नमस्ते\nworld' });
  });

  it('parses WebVTT identifiers, metadata, and cue settings', () => {
    const document = unwrap(
      parseSubtitle(
        'WEBVTT\nLanguage: en\n\nintro\n00:01.000 --> 00:02.500 line:90%\nHello',
        'vtt',
      ),
    );
    expect(document.segments[0]).toMatchObject({ start: 1000, end: 2500, text: 'Hello' });
  });

  it('parses ASS dialogue without splitting commas in caption text', () => {
    const source = `[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,Host,0,0,0,,Hello, world\\Nagain`;
    const document = unwrap(parseSubtitle(source, 'ass'));
    expect(document.segments[0]).toMatchObject({
      start: 1000,
      end: 2500,
      speaker: 'Host',
      text: 'Hello, world\nagain',
    });
  });

  it('exports each supported format and round-trips timing and text', () => {
    let document = createSubtitleDocument('mr');
    document = unwrap(
      addSubtitleSegment(document, {
        id: 'cue-1' as SegmentId,
        start: ms(1234),
        end: ms(4567),
        text: 'नमस्कार\nमित्रांनो',
      }),
    );

    for (const format of ['srt', 'vtt', 'ass'] as const) {
      const exported = unwrap(exportSubtitle(document, format));
      const parsed = unwrap(parseSubtitle(exported, format, 'mr'));
      expect(parsed.segments[0]?.text).toBe('नमस्कार\nमित्रांनो');
      expect(Math.abs((parsed.segments[0]?.start ?? 0) - 1234)).toBeLessThanOrEqual(
        format === 'ass' ? 5 : 0,
      );
    }
  });

  it('returns actionable failures for empty and overlapping files', () => {
    expect(parseSubtitle('', 'srt').ok).toBe(false);
    const result = parseSubtitle(
      '1\n00:00:00,000 --> 00:00:02,000\nOne\n\n2\n00:00:01,000 --> 00:00:03,000\nTwo',
      'srt',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.recovery).toContain('Move or shorten');
  });
});

function unwrap<T>(result: import('@videodip/shared').Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
