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
