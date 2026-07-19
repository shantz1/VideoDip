// Run with: node --test scripts/whisper-accuracy/wer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForWer, wordErrorRate } from './wer.mjs';

test('identical text has zero WER', () => {
  assert.equal(wordErrorRate(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
});

test('one substitution out of three words is 1/3 WER', () => {
  assert.equal(wordErrorRate(['a', 'b', 'c'], ['a', 'x', 'c']), 1 / 3);
});

test('completely different text can exceed 1.0 (more insertions than reference words)', () => {
  assert.equal(wordErrorRate(['a'], ['x', 'y', 'z']), 3);
});

test('empty hypothesis is 100% WER (all deletions)', () => {
  assert.equal(wordErrorRate(['a', 'b'], []), 1);
});

test('empty reference is defined as zero WER, not division by zero', () => {
  assert.equal(wordErrorRate([], ['a', 'b']), 0);
});

test('normalizeForWer lowercases, strips punctuation, and splits on whitespace', () => {
  assert.deepEqual(normalizeForWer('Hello, World!  How are you?'), [
    'hello',
    'world',
    'how',
    'are',
    'you',
  ]);
});
