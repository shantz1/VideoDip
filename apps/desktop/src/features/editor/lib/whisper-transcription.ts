import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  appError,
  err,
  ms,
  normalized,
  ok,
  type MediaLocator,
  type Result,
  type Transcription,
  type TranscriptionModelManager,
  type TranscriptionModelStatus,
  type TranscriptionProvider,
} from '@videodip/shared';
import { z } from 'zod';

const modelSchema = z.object({
  id: z.string(),
  sizeBytes: z.number().int().positive(),
  quality: z.string(),
  installed: z.boolean(),
});
const statusSchema = z.object({ runtimeAvailable: z.boolean(), models: z.array(modelSchema) });
const offsetsSchema = z.object({ from: z.number().nonnegative(), to: z.number().positive() });
const outputSchema = z.object({
  result: z.object({ language: z.string().min(1) }),
  transcription: z.array(
    z.object({
      offsets: offsetsSchema,
      text: z.string(),
      tokens: z
        .array(
          z.object({
            text: z.string(),
            offsets: offsetsSchema.optional(),
            p: z.number().optional(),
          }),
        )
        .optional(),
      speaker: z.string().optional(),
    }),
  ),
});
const progressSchema = z.object({
  taskId: z.string(),
  stage: z.string(),
  fraction: z.number(),
});

const WHISPER_LANGUAGE_CODES = [
  'af',
  'am',
  'ar',
  'as',
  'az',
  'ba',
  'be',
  'bg',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fo',
  'fr',
  'gl',
  'gu',
  'ha',
  'haw',
  'he',
  'hi',
  'hr',
  'ht',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jw',
  'ka',
  'kk',
  'km',
  'kn',
  'ko',
  'la',
  'lb',
  'ln',
  'lo',
  'lt',
  'lv',
  'mg',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'ne',
  'nl',
  'nn',
  'no',
  'oc',
  'pa',
  'pl',
  'ps',
  'pt',
  'ro',
  'ru',
  'sa',
  'sd',
  'si',
  'sk',
  'sl',
  'sn',
  'so',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'tk',
  'tl',
  'tr',
  'tt',
  'uk',
  'ur',
  'uz',
  'vi',
  'yi',
  'yo',
  'zh',
] as const;

type NativeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Creates the desktop Whisper provider and its on-demand model manager. */
export function createWhisperIntegration(
  runInvoke: NativeInvoke = (command, args) => invoke(command, args),
): { provider: TranscriptionProvider; models: TranscriptionModelManager } {
  let selectedModel = 'small-q5_1';
  const failure = (message: string, cause: unknown): Result<never> =>
    err(
      appError('PROCESS_FAILED', message, 'Check the AI runtime and model, then retry.', {
        cause,
        retryable: true,
      }),
    );
  const status = async (): Promise<
    Result<{ runtimeAvailable: boolean; models: TranscriptionModelStatus[] }>
  > => {
    try {
      const parsed = statusSchema.safeParse(await runInvoke('get_whisper_status'));
      return parsed.success
        ? ok(parsed.data)
        : failure('Whisper status was invalid.', parsed.error);
    } catch (cause) {
      return failure('Could not inspect the Whisper runtime.', cause);
    }
  };
  const runProgressTask = async (
    command: string,
    args: Record<string, unknown>,
    onProgress: (progress: number, stage: string) => void,
    signal?: AbortSignal,
  ): Promise<Result<unknown>> => {
    const taskId = crypto.randomUUID();
    let unlisten: () => void = () => {};
    try {
      unlisten = await listen<unknown>('whisper-progress', (event) => {
        const parsed = progressSchema.safeParse(event.payload);
        if (parsed.success && parsed.data.taskId === taskId) {
          onProgress(normalized(parsed.data.fraction), parsed.data.stage);
        }
      });
    } catch (cause) {
      return failure('Could not subscribe to Whisper progress.', cause);
    }
    const cancel = () => void runInvoke('cancel_whisper_task', { taskId }).catch(() => undefined);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) {
        return err(appError('CANCELLED', 'Whisper task was cancelled.', 'Retry when ready.'));
      }
      const value = await runInvoke(command, { taskId, ...args });
      return signal?.aborted
        ? err(appError('CANCELLED', 'Whisper task was cancelled.', 'Retry when ready.'))
        : ok(value);
    } catch (cause) {
      return signal?.aborted
        ? err(appError('CANCELLED', 'Whisper task was cancelled.', 'Retry when ready.'))
        : failure('The local Whisper task failed.', cause);
    } finally {
      signal?.removeEventListener('abort', cancel);
      unlisten();
    }
  };
  const models: TranscriptionModelManager = {
    status,
    selected: () => selectedModel,
    select: (id) => {
      selectedModel = id;
    },
    download: async (modelId, onProgress, signal) => {
      const result = await runProgressTask(
        'download_whisper_model',
        { modelId },
        onProgress,
        signal,
      );
      return result.ok ? ok(undefined) : result;
    },
    delete: async (modelId) => {
      try {
        await runInvoke('delete_whisper_model', { modelId });
        return ok(undefined);
      } catch (cause) {
        return failure('Could not delete the Whisper model.', cause);
      }
    },
  };
  const provider: TranscriptionProvider = {
    id: 'whisper.cpp',
    name: 'Whisper (local)',
    capabilities: async () =>
      ok({
        wordTimestamps: true,
        diarization: false,
        offline: true,
        gpuAccelerated: false,
        languages: WHISPER_LANGUAGE_CODES,
      }),
    availability: async () => {
      const result = await status();
      if (!result.ok) return result;
      if (!result.value.runtimeAvailable) {
        return ok({ state: 'runtime-missing', detail: 'whisper-cli is not bundled.' });
      }
      return result.value.models.some((model) => model.id === selectedModel && model.installed)
        ? ok({ state: 'ready' })
        : ok({ state: 'model-missing', detail: `Download ${selectedModel}.` });
    },
    transcribe: async (audio: MediaLocator, options, signal, onProgress) => {
      const started = performance.now();
      const result = await runProgressTask(
        'transcribe_media',
        {
          request: {
            source: String(audio),
            modelId: selectedModel,
            ...(options?.language === undefined ? {} : { language: options.language }),
            ...(options?.prompt === undefined ? {} : { prompt: options.prompt }),
          },
        },
        (progress, stage) => onProgress?.({ progress: normalized(progress), stage }),
        signal,
      );
      if (!result.ok) return result;
      return parseWhisperOutput(result.value, ms(Math.round(performance.now() - started)));
    },
  };
  return { provider, models };
}

/** Validates whisper.cpp full-JSON output and converts tokens into timed words. */
export function parseWhisperOutput(
  source: unknown,
  durationMs: Transcription['durationMs'],
): Result<Transcription> {
  const parsed = outputSchema.safeParse(source);
  if (!parsed.success) {
    return err(
      appError(
        'PROCESS_FAILED',
        'Whisper returned an unsupported result.',
        'Check the AI runtime and model, then retry.',
        { cause: parsed.error, retryable: true },
      ),
    );
  }
  return ok({
    language: parsed.data.result.language,
    durationMs,
    segments: parsed.data.transcription
      .map((segment) => ({
        text: segment.text.trim(),
        start: ms(segment.offsets.from),
        end: ms(segment.offsets.to),
        words: tokensToWords(segment.tokens ?? []),
        ...(segment.speaker ? { speaker: segment.speaker } : {}),
      }))
      .filter((segment) => segment.text.length > 0 && segment.end > segment.start),
  });
}

function tokensToWords(tokens: z.infer<typeof outputSchema>['transcription'][number]['tokens']) {
  const words: {
    text: string;
    start: ReturnType<typeof ms>;
    end: ReturnType<typeof ms>;
    confidence?: ReturnType<typeof normalized>;
  }[] = [];
  for (const token of tokens ?? []) {
    if (
      token.offsets === undefined ||
      token.offsets.to <= token.offsets.from ||
      !token.text.trim() ||
      token.text.includes('<|')
    ) {
      continue;
    }
    const startsWord = /^\s/u.test(token.text) || words.length === 0;
    const confidence = token.p === undefined ? undefined : normalized(token.p);
    if (startsWord) {
      words.push({
        text: token.text.trim(),
        start: ms(token.offsets.from),
        end: ms(token.offsets.to),
        ...(confidence === undefined ? {} : { confidence }),
      });
      continue;
    }
    const previous = words.at(-1);
    if (previous !== undefined && token.offsets.from >= previous.end) {
      previous.text += token.text.trim();
      previous.end = ms(token.offsets.to);
    }
  }
  return words;
}

/** Creates an explicit unsupported adapter for the browser-only editor host. */
export function createBrowserWhisperIntegration(): {
  provider: TranscriptionProvider;
  models: TranscriptionModelManager;
} {
  const unsupported = (): Result<never> =>
    err(appError('UNSUPPORTED', 'Local Whisper needs the desktop host.', 'Open VideoDip Desktop.'));
  return {
    provider: {
      id: 'whisper.cpp',
      name: 'Whisper (desktop only)',
      capabilities: async () => unsupported(),
      availability: async () => ok({ state: 'unsupported' as const }),
      transcribe: async () => unsupported(),
    },
    models: {
      status: async () => unsupported(),
      download: async () => unsupported(),
      delete: async () => unsupported(),
      select: () => undefined,
      selected: () => 'small-q5_1',
    },
  };
}
