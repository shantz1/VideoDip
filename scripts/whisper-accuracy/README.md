# Whisper multilingual accuracy check

Real, reproducible accuracy fixtures for the languages `docs/PLAN.md`'s
"Multilingual Whisper acceptance matrix" item names: Hindi, Marathi, Tamil,
Telugu, Gujarati, Bengali, English, and one representative foreign language
(French). Each fixture is a short real speech clip with a known-correct
transcript; `run.mjs` transcribes it with the app's own bundled
`whisper-cli` and reports word error rate (WER) against the reference.

## Fixture provenance and licenses

- `hi.*`, `ta.*`, `te.*`, `gu.*`, `en.*`, `fr.*` — one `validation`-split
  utterance each from [Google FLEURS](https://huggingface.co/datasets/google/fleurs)
  (CC BY 4.0), fetched via HuggingFace's `datasets-server` API (individual
  signed asset URLs — no full dataset download).
- `mr.*` — one utterance from [OpenSLR SLR64](https://openslr.org/64/)
  (Marathi, CC BY-SA 4.0). Extracted from the 700MB corpus zip via HTTP range
  requests (Python's `zipfile` opened against a range-request-backed
  file-like object) — the full archive was never downloaded.
- `bn.*` — one utterance from [OpenSLR SLR37](https://openslr.org/37/)
  (Indian Bengali, CC BY-SA 4.0), extracted the same way.

Attribute FLEURS and OpenSLR SLR64/SLR37 (with their CC BY / CC BY-SA terms)
if these fixtures or their transcripts are redistributed outside this repo.

## Running it

```sh
node scripts/whisper-accuracy/run.mjs --model path/to/ggml-tiny.bin
```

Needs a provisioned `whisper-cli` (`pnpm ai:provision:windows`) and a
downloaded ggml model — the app's own model manager downloads these; see
`apps/desktop/src-tauri/src/whisper.rs`'s `MODELS` array for the exact
filenames (`ggml-tiny.bin`, `ggml-base.bin`, `ggml-small-q5_1.bin`, ...).

`--l auto` is used deliberately — this measures the app's real
auto-detection behavior, not accuracy given a hinted language.

## Results (2026-07-19, `ggml-tiny.bin`, "Fastest" tier)

| Language | WER | What actually happened |
| --- | --- | --- |
| English | 0.13 | Accurate. |
| French | 0.29 | Mostly accurate; a few word-level errors. |
| Tamil | 0.78 | Correct script, high error rate — recognizable but unreliable. |
| Gujarati | 1.00 | **Output is Latin-script transliteration, not Gujarati script.** Phonetically plausible-looking but WER is meaningless here since the reference is in native script — this is a distinct, more useful finding than "wrong": the model chose the wrong output script. |
| Hindi | 1.07 | Same as Gujarati — Latin transliteration instead of Devanagari. |
| Marathi | 1.33 | Same failure mode — Latin transliteration, and the short reference (6 words) makes the ratio look extreme. |
| Telugu | 1.11 | **Hallucination.** Output is fluent but entirely unrelated English ("please subscribe to my channel...") — the model produced confident, well-formed text with no connection to the audio. |
| Bengali | 1.00 | **Degenerate hallucination.** Output is a repeated numeral token, not language at all. |

**What this means for the product**: `ggml-tiny.bin` (the app's fastest/smallest
tier) is not usable for Bengali or Telugu — it doesn't fail loudly, it
produces fluent-looking garbage a user could ship without noticing. Hindi,
Marathi, and Gujarati come back in the wrong script entirely. Only English,
French, and (marginally) Tamil are usable at this tier.

**Not yet run**: the same fixtures against `small-q5_1` (the app's own
*Recommended* tier) or larger models — tiny was what fit this session's time
budget and is the worst case by design, but it means these numbers are a
floor, not the tier users are actually steered toward. Re-running
`run.mjs --model <recommended-model-path>` is the natural next step and
should be done before treating Bengali/Telugu/Hindi/Marathi/Gujarati support
as validated either way.

**Not covered**: code-switching (mixed-language utterances within one clip).
FLEURS and the OpenSLR corpora used here are monolingual per utterance;
sourcing or constructing a genuine code-switched fixture is separate,
deliberately-deferred work — synthetically concatenating two monolingual
clips would test something different (a hard language boundary) from real
code-switching (blended mid-sentence), and labeling that as the same thing
would be misleading.
