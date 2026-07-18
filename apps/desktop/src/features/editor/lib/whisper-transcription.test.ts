import { ms } from '@videodip/shared';
import { describe, expect, it } from 'vitest';
import { createWhisperIntegration, parseWhisperOutput } from './whisper-transcription';

describe('parseWhisperOutput', () => {
  it('validates full JSON and combines tokenizer pieces into timed words', () => {
    const result = parseWhisperOutput(
      {
        result: { language: 'mr' },
        transcription: [
          {
            offsets: { from: 100, to: 900 },
            text: ' VideoDip works',
            tokens: [
              { text: ' Video', offsets: { from: 100, to: 400 }, p: 0.9 },
              { text: 'Dip', offsets: { from: 400, to: 500 }, p: 0.8 },
              { text: ' works', offsets: { from: 550, to: 900 }, p: 0.95 },
            ],
          },
        ],
      },
      ms(40),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.language).toBe('mr');
    expect(result.value.segments[0]?.words).toEqual([
      { text: 'VideoDip', start: 100, end: 500, confidence: 0.9 },
      { text: 'works', start: 550, end: 900, confidence: 0.95 },
    ]);
  });

  it('rejects malformed native output at the IPC boundary', () => {
    expect(parseWhisperOutput({ result: {} }, ms(1)).ok).toBe(false);
  });

  it('drops repetition-loop hallucination segments instead of subtitling them', () => {
    const result = parseWhisperOutput(
      {
        result: { language: 'bo' },
        transcription: [
          {
            offsets: { from: 0, to: 4000 },
            text: ' ' + 'ༀ'.repeat(70),
            tokens: [],
          },
          {
            offsets: { from: 4000, to: 5000 },
            text: ' खरा मजकूर इथे आहे',
            tokens: [],
          },
        ],
      },
      ms(10),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.segments).toHaveLength(1);
    expect(result.value.segments[0]?.text).toBe('खरा मजकूर इथे आहे');
  });

  it('rebuilds word timing from segment text when tokens carry split-character fragments', () => {
    // Devanagari: whisper.cpp BPE tokens split characters mid-byte, arriving
    // here as U+FFFD after the host's lossy UTF-8 decode. The segment text
    // stays whole, so words must come from it — never from broken tokens.
    const result = parseWhisperOutput(
      {
        result: { language: 'mr' },
        transcription: [
          {
            offsets: { from: 1000, to: 2000 },
            text: ' नमस्ते सर',
            tokens: [
              { text: ' न�', offsets: { from: 1000, to: 1400 }, p: 0.9 },
              { text: '�स्ते', offsets: { from: 1400, to: 1600 }, p: 0.8 },
              { text: ' सर', offsets: { from: 1600, to: 2000 }, p: 0.95 },
            ],
          },
        ],
      },
      ms(30),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const words = result.value.segments[0]?.words ?? [];
    expect(words.map((word) => word.text)).toEqual(['नमस्ते', 'सर']);
    expect(words.every((word) => !word.text.includes('�'))).toBe(true);
    // Proportional interpolation: 6 of 8 characters, then 2 of 8.
    expect(words[0]).toMatchObject({ start: 1000, end: 1750 });
    expect(words[1]).toMatchObject({ start: 1750, end: 2000 });
  });

  it('accepts zero-length whisper.cpp control-token offsets', () => {
    const result = parseWhisperOutput(
      {
        result: { language: 'hi' },
        transcription: [
          {
            offsets: { from: 0, to: 900 },
            text: ' namaste',
            tokens: [
              { text: '[_BEG_]', offsets: { from: 0, to: 0 }, p: 1 },
              { text: ' namaste', offsets: { from: 100, to: 900 }, p: 0.95 },
              { text: '[_TT_45]', offsets: { from: 900, to: 900 }, p: 0.8 },
            ],
          },
        ],
      },
      ms(20),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.segments[0]?.words).toEqual([
      { text: 'namaste', start: 100, end: 900, confidence: 0.95 },
    ]);
  });

  it('exposes the complete multilingual model language list through the provider port', async () => {
    const { provider } = createWhisperIntegration(async () => ({
      runtimeAvailable: true,
      models: [],
    }));
    const result = await provider.capabilities();
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.languages === 'auto') return;
    expect(result.value.languages).toEqual(
      expect.arrayContaining(['en', 'hi', 'mr', 'ta', 'te', 'gu', 'bn', 'es', 'ja', 'zh']),
    );
    expect(result.value.languages.length).toBeGreaterThan(90);
  });
});
