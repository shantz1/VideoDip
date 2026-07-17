# ADR-0007: Transcription runs on whisper.cpp as a Tauri sidecar; models download on demand

- **Status:** Proposed — needs Shantanu's sign-off before any implementation
- **Date:** 2026-07-17

## Context

ADR-0002 names the transcription engine as "Faster-Whisper / WhisperX." Both
are Python. The desktop shell that now actually exists (ADR-0004) ships **no
Python and no Node** — it is a Rust binary serving a static-exported webview.
As written, ADR-0002's transcription plan cannot run in ADR-0004's app.

The user-facing requirement (asked 2026-07-17): the app must offer to
download the AI models it needs, locally, from inside the editor. The
`TranscriptionProvider` port in `packages/shared` already anticipates this —
`isAvailable()` is documented as "capable in principle but unavailable
because its model has not been downloaded yet" — but no runtime was ever
chosen that the shipped shell can actually execute.

Constraints that bound the choice:

- **Offline-first (ADR-0002).** Transcription may *require a one-time
  download*, but a missing model must degrade one feature, never the editor.
- **One-file install.** The download-and-run story (ADR-0004) must survive.
  A runtime that needs an installer, a Python environment, or PATH surgery
  breaks the product's core promise.
- **The port is fixed.** Whatever runs must sit behind
  `TranscriptionProvider` — word timestamps, progress callbacks, abort that
  actually kills the child process.
- **GPU where available, CPU where not** (constitution §6).

## Decision (proposed)

**Ship `whisper.cpp` as a Tauri sidecar binary. Download GGUF/GGML models on
demand, inside the app, with real progress.**

Concretely:

1. **Runtime.** `whisper.cpp`'s `whisper-cli` (or `whisper-server`) compiled
   per-platform, declared in `tauri.conf.json`'s `externalBin` so Tauri
   bundles it into the installer. It is a single native executable — no
   interpreter, no environment. Spawned and supervised from Rust; killed on
   abort (the port's contract).
2. **Models.** Not bundled — the installer stays small. The AI panel lists
   model sizes (tiny ~75 MB → large ~3 GB) with disk cost and a quality/speed
   hint; the user picks one and the Rust side streams it from Hugging Face
   into app-data with byte-level progress events. `isAvailable()` = "model
   file present on disk," answerable offline, exactly as the port requires.
3. **Provider.** `WhisperCppProvider` implements `TranscriptionProvider`,
   living outside `packages/shared` per that file's own rule. The webview
   talks to it over Zod-validated IPC; progress arrives as Tauri events.
4. **GPU.** whisper.cpp builds carry CUDA/Vulkan variants where feasible;
   `capabilities().gpuAccelerated` reports what this machine actually got.
   CPU fallback always works.
5. **ADR-0002 stands amended** on the named engine only: "Faster-Whisper /
   WhisperX" → "whisper.cpp." Everything else in ADR-0002 (local compute,
   thin server) is unchanged — this ADR is the *implementation* of that
   decision for the shell we actually built, not a reversal of it.

## Consequences

**Good:**

- Works in the real shell: one native sidecar next to one native app. The
  installer story survives intact.
- Small install, honest downloads: users pay only for the model size they
  choose, with visible progress, once.
- Abort is enforceable — a killed sidecar process is a killed transcription,
  satisfying the port's resource-leak clause.
- The provider is just an implementation of the existing port, so a future
  plugin can ship a *different* engine without touching core — the
  plugin-readiness bar in the constitution.

**Bad, and accepted:**

- Word-level timestamps from whisper.cpp are serviceable but weaker than
  WhisperX's forced alignment. If word-karaoke captions later demand better
  alignment, that is a new ADR (likely a separate alignment pass), not a
  silent swap.
- Per-platform sidecar builds (Windows/macOS/Linux × CPU/GPU variants) are a
  real CI cost. ADR-0002 already accepted platform binaries as a burden;
  this adds to it.
- Hugging Face as the model host is a third-party availability dependency at
  download time (only). Mitigable later by mirroring from the VPS.

## Alternatives rejected

- **Bundle Python + Faster-Whisper** — a second runtime (~1 GB with CUDA
  wheels) inside a Tauri app, with env isolation and startup-time costs, to
  keep a name written before the shell existed. Worst fit for the one-file
  install promise.
- **Sherpa/ONNX Whisper via a Rust crate (in-process)** — attractive (no
  sidecar at all), but couples the model runtime into the app binary: a
  runtime crash takes the editor with it, and GPU backend selection is far
  less mature than whisper.cpp's. Revisit if whisper.cpp's sidecar
  supervision proves painful.
- **transformers.js in the webview** — WebGPU Whisper in-browser is real but
  wrong here: it holds model weights in webview memory against a 400 MB idle
  budget, and CPU fallback in WASM is far slower than native. The webview is
  for UI (constitution §6: heavy work goes off-main).
- **Cloud transcription** — contradicts ADR-0002 outright. Not considered.

## What approval unlocks (implementation order)

1. Sidecar packaging of a CPU-only whisper.cpp build, Windows first.
2. `WhisperCppProvider` behind the port, with a fake-driven test suite.
3. Model download UI in the AI panel (list → download with progress →
   delete), backed by Rust streaming + a checksum.
4. GPU build variants, later, measured before shipped.
