# 0011 — Node sidecar for headless Remotion export

- Status: accepted
- Date: 2026-07-18
- Owner sign-off: 2026-07-18 ("option A as you recommend")

## Context

Preview is rendered by Remotion (React); export is FFmpeg cuts-only. What the
user sees — subtitles, keyframe animation, transitions, styled captions — is
not what the exported MP4 contains. `@remotion/renderer` closes that gap but
requires Node.js, which ADR-0002's desktop shell does not bundle.

Alternatives considered: reimplementing every visual feature as FFmpeg filter
graphs (two render implementations that drift apart — rejected), and a native
GPU renderer (months of work — deferred). OpenCut's one-Rust-core direction
was reviewed as a reference; it does not solve composited export today.

## Decision

1. **A Node runtime becomes a provisioned sidecar, exactly like whisper-cli.**
   Development machines use their own `node` from PATH (override:
   `VIDEODIP_NODE`). Release bundles ship a pinned portable Node binary via
   the same `externalBin` mechanism as the Whisper runtime.
2. **`apps/renderer` gains a headless CLI entry** (`render-cli`) that consumes
   the same Zod-validated serializable composition contract the live Player
   uses — one composition, two consumers, zero drift. It reports progress as
   machine-readable lines on stdout and writes the encoded file itself via
   `@remotion/renderer`.
3. **Chromium is a provisioned dependency.** Remotion renders through Chrome
   Headless Shell; it is downloaded once by the provisioning script (like
   Whisper models), never at export time. No network at export time, ever.
4. **The FFmpeg cuts-only path is retained** as the fallback whenever the
   render runtime is not provisioned, and remains the fast path for exports
   with no composited content. Renderer selection is explicit and visible in
   the export UI, not silent.
5. **The Rust host stays thin:** spawn, stream progress, cancel, timeout —
   the same contract as FFmpeg export and Whisper transcription tasks.

## Consequences

- WYSIWYG exports: subtitles/effects burn in through the very composition the
  preview showed.
- Installer grows by the Node runtime + headless Chromium; acceptable against
  the alternative of maintaining two render implementations.
- The sidecar is desktop-only. Browser export remains explicitly unsupported
  until the online-scope ADR exists.
- Amends ADR-0002's "no Node on desktop" in the narrowest possible way: Node
  ships as an isolated render sidecar, not as an application runtime.
