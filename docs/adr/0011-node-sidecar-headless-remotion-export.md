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
  the alternative of maintaining two render implementations. Measured
  2026-07-19: the staged render resource tree (pruned `@videodip/renderer` +
  production `node_modules` + Chrome Headless Shell) is ~473MB; the portable
  Node sidecar is a further ~80MB.
- The sidecar is desktop-only. Browser export remains explicitly unsupported
  until the online-scope ADR exists.
- Amends ADR-0002's "no Node on desktop" in the narrowest possible way: Node
  ships as an isolated render sidecar, not as an application runtime.

### Addendum 2026-07-19: release packaging closed

The decision above covered the *shape* of the solution but not its packaging
mechanics — the dev-machine path (PATH `node`, monorepo `apps/renderer/dist`)
worked from day one, but an installed release build had no bundled Node, no
bundled render CLI, and no bundled Chromium, so it silently could only ever
use the FFmpeg cuts-only fallback. Closed as follows:

- **Node**: `scripts/provision-node-runtime.ps1` downloads a pinned, checksum
  -verified portable Node (mirrors `provision-whisper-runtime.ps1` exactly),
  staged as the `binaries/node` `externalBin` in `tauri.release.conf.json`.
- **Render CLI + dependencies**: `scripts/stage-render-resources.ps1` builds
  `@videodip/renderer` and runs `pnpm deploy --prod --legacy
  --config.node-linker=hoisted` into `apps/desktop/src-tauri/resources/render`,
  bundled via `tauri.release.conf.json`'s `resources` map. **The
  `node-linker=hoisted` flag is load-bearing, not cosmetic**: pnpm's default
  virtual-store deploy links `node_modules/<pkg>` via an *absolute* symlink
  into `node_modules/.pnpm/...`, verified by inspection to resolve to the
  staging machine's own filesystem path — invisible in dev, but it would have
  silently produced a broken render sidecar on every end-user machine, since
  that absolute path does not exist once the resource bundle is installed
  elsewhere. Caught by actually running the staging script and inspecting the
  output, not by reasoning about `pnpm deploy` from its docs alone.
- **Chromium**: `ensure-browser` runs from *inside* the staged directory (not
  the repo root), so `@remotion/renderer`'s cache — resolved by walking up
  from `process.cwd()` to the nearest `package.json` — lands at
  `resources/render/node_modules/.remotion`, verified by inspection to
  contain `chrome-headless-shell.exe` at the expected path post-staging.
- **`render.rs` had a latent related bug**: it discovered `node`/`cli` paths
  correctly but never set the spawned process's working directory, so
  Remotion's cwd-walk inherited whatever directory Tauri happened to launch
  from — unrelated to where the render runtime or its browser cache actually
  live. Fixed by deriving `cwd` from the render CLI's own package root
  (`dist/render-cli.js` → its parent's parent) and passing it to `Command`,
  which also hardens the dev-machine path, not just the release one.
- **Verified empirically**, not just by reasoning: both provisioning scripts
  were actually run (real network downloads, real checksum verification);
  the staged output was inspected directly for symlinks (found none) and for
  the Chrome executable's presence at the expected path; `ensure-browser`
  executing through the bundled Node against the deployed `node_modules`
  printed `browser=ready`, confirming the portable dependency tree resolves
  correctly at runtime, not just that the files exist. **Not yet verified**:
  a full `tauri build --config tauri.release.conf.json` producing an
  installer, installing it, and exporting a real composited video end-to-end
  through the built application — that remains the next real-world check
  before the first tagged release.
