import { describe, expect, it } from 'vitest';
import { ms, normalized, type MediaLocator } from '../branded/branded.js';
import { ok } from '../result/result.js';
import type { TranscriptionProvider } from './transcription.port.js';

class FakeTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'fake';
  readonly name = 'Fake transcription';

  async capabilities() {
    return ok({
      wordTimestamps: true,
      diarization: false,
      offline: true,
      gpuAccelerated: false,
      languages: 'auto' as const,
    });
  }

  async availability() {
    return ok({ state: 'ready' as const });
  }

  async transcribe(
    _audio: MediaLocator,
    _options?: Parameters<TranscriptionProvider['transcribe']>[1],
    _signal?: AbortSignal,
    onProgress?: Parameters<TranscriptionProvider['transcribe']>[3],
  ) {
    onProgress?.({ progress: normalized(1), stage: 'Complete' });
    return ok({ segments: [], language: 'en', durationMs: ms(1) });
  }
}

describe('TranscriptionProvider', () => {
  it('is substitutable across host-owned media locators without raw promises', async () => {
    const provider: TranscriptionProvider = new FakeTranscriptionProvider();
    const progress: string[] = [];

    const available = await provider.availability();
    const result = await provider.transcribe(
      'opfs://media/voice.wav' as MediaLocator,
      undefined,
      undefined,
      (update) => progress.push(update.stage),
    );

    expect(available).toEqual({ ok: true, value: { state: 'ready' } });
    expect(result.ok).toBe(true);
    expect(progress).toEqual(['Complete']);
  });
});
