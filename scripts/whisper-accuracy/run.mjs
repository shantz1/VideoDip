// Runs the bundled whisper.cpp CLI against every fixture in ./fixtures and
// reports word error rate against each fixture's known-correct transcript.
//
// Requires a provisioned model (see `pnpm ai:provision:windows`, or set
// WHISPER_MODEL to any local ggml-*.bin path — the tiny/base/small-q5_1/
// medium-q5_0/large-v3-turbo-q5_0 ids in whisper.rs's MODELS array name the
// exact files the app itself downloads).
//
// Usage: node scripts/whisper-accuracy/run.mjs [--model path/to/ggml-*.bin]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeForWer, wordErrorRate } from './wer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures');
const REPO_ROOT = join(HERE, '..', '..');

const LANGUAGES = [
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'bn', name: 'Bengali' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French (foreign-language set)' },
];

function findWhisperCli() {
  const candidate = join(
    REPO_ROOT,
    'apps/desktop/src-tauri/binaries/whisper-cli-x86_64-pc-windows-msvc.exe',
  );
  if (existsSync(candidate)) return candidate;
  throw new Error(
    `whisper-cli not found at ${candidate}. Run \`pnpm ai:provision:windows\` first.`,
  );
}

function parseArgs(argv) {
  const modelIndex = argv.indexOf('--model');
  return { model: modelIndex === -1 ? undefined : argv[modelIndex + 1] };
}

function main() {
  const { model } = parseArgs(process.argv.slice(2));
  const modelPath = model ?? process.env.WHISPER_MODEL;
  if (!modelPath || !existsSync(modelPath)) {
    throw new Error(
      'No model found. Pass --model <path/to/ggml-*.bin> or set WHISPER_MODEL. ' +
        'The app downloads these via the in-app model manager; see whisper.rs MODELS for filenames.',
    );
  }
  const whisperCli = findWhisperCli();
  const workDir = mkdtempSync(join(tmpdir(), 'videodip-whisper-accuracy-'));

  const results = [];
  try {
    for (const { code, name } of LANGUAGES) {
      const audioPath = join(FIXTURES_DIR, `${code}.wav`);
      const referencePath = join(FIXTURES_DIR, `${code}.txt`);
      if (!existsSync(audioPath) || !existsSync(referencePath)) {
        results.push({ code, name, error: 'fixture missing' });
        continue;
      }
      const outputPrefix = join(workDir, code);
      const started = Date.now();
      execFileSync(
        whisperCli,
        ['-m', modelPath, '-f', audioPath, '-l', 'auto', '-otxt', '-of', outputPrefix, '-np'],
        { stdio: 'pipe' },
      );
      const elapsedMs = Date.now() - started;
      const hypothesis = readFileSync(`${outputPrefix}.txt`, 'utf8');
      const reference = readFileSync(referencePath, 'utf8');
      const rate = wordErrorRate(normalizeForWer(reference), normalizeForWer(hypothesis));
      results.push({ code, name, wer: rate, elapsedMs, hypothesis: hypothesis.trim() });
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  for (const result of results) {
    if (result.error) {
      console.log(`${result.name} (${result.code}): ${result.error}`);
      continue;
    }
    console.log(
      `${result.name} (${result.code}): WER=${result.wer.toFixed(2)}  ${result.elapsedMs}ms`,
    );
    console.log(`  -> ${result.hypothesis.slice(0, 120)}`);
  }
}

main();
