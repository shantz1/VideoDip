# Working plan — desktop editor shell

A living checklist, not a decision record (see `docs/adr/` for those). Updated
as items complete or new ones surface. Worked one at a time, per `CLAUDE.md`'s
"one feature at a time, completely" rule.

## Now

- [ ] **Real media duration on import** — every clip added from the media
      pool is a placeholder 5s (`DEFAULT_CLIP_DURATION` in
      `left-sidebar.tsx`) because `media-engine` doesn't probe files yet.
      Probing belongs behind a Tauri command (FFmpeg/ffprobe orchestration is
      `media-engine`'s whole job); the import flow then passes real duration
      through to `addClip`.

## Queued (user-requested, not yet started)

- [ ] **Versioning + automatic client updates** (asked 2026-07-17, reaffirmed
      same day: the client must download and apply updates itself when one
      exists — a notification alone is not enough). The
      natural fit for the existing architecture: `tauri-plugin-updater` on
      the desktop checking a static update manifest served by `apps/api` —
      ADR-0002 already names "the update feed" as one of the VPS's few
      legitimate jobs. Needs: a release/versioning scheme (semver via
      Conventional Commits is the obvious candidate — the repo already
      mandates them), update-manifest signing keys (Tauri requires signed
      updates; the private key is exactly the kind of secret SECURITY.md
      says never enters the repo), a notification UI ("update available —
      restart to apply" — auto-apply still tells the user what happened, it
      just doesn't ask permission to download), and offline tolerance (an
      unreachable update feed must never degrade the editor; ADR-0002 again).
      Deserves a proper setup pass of its own plus an ADR once the release
      pipeline exists. GitHub remote now exists
      (github.com/shantz1/VideoDip, added 2026-07-17) — GitHub Releases can
      serve as the update-manifest host until `apps/api` is real, which
      `tauri-plugin-updater` supports out of the box.

## Needs a decision before building — do not start silently

- [ ] **AI model download (Whisper or equivalent)** — ADR-0002 names
      Faster-Whisper/WhisperX, both Python-based. The desktop shell has no
      Node *and* no Python runtime bundled, so shipping either means bundling
      a Python distribution inside a Tauri app — a real architectural cost
      nobody has signed off on. A Rust-native alternative (e.g. `whisper.cpp`
      as a Tauri sidecar binary, downloading GGML model files directly) avoids
      that entirely but changes the named runtime in ADR-0002. Needs an ADR
      before implementation starts, not just a wired button.

## Done (this session, 2026-07-17)

- **Real video preview via Remotion** — `apps/renderer` gained its first real
  content: `VideoDipComposition`, headless-drivable, consumed by the desktop's
  new `preview-player.tsx` (`@remotion/player` synced two-way with the editor
  store's transport) via the pure `composition-adapter.ts`. Asset-path
  resolution injected, so the adapter tests run with no Tauri alive.
- **"Add to timeline" no longer rejects when the playhead is occupied** —
  new pure `findFreeStart` operation in `packages/timeline` (7 tests): the
  media panel now places the clip at the playhead when free, otherwise in the
  first gap after it. The CONFLICT error path stays for genuinely invalid
  placements (drag/move).

- **`packages/timeline` domain model** — framework-free `Track`/`Clip`/
  `TimelineDocument` plus pure operations: `addClip`, `removeClip`, `moveClip`,
  `trimClip`, `splitClip`, `getDuration`. All fallible ops return `Result`,
  never throw. 25 tests, including overlap/conflict edge cases.
- **Media pool → timeline** — a "+" affordance per media item places a
  placeholder-duration clip on the video track at the playhead; failures
  (overlap) surface as an inline alert, not a swallowed error.
- **Real clips in `timeline-panel.tsx`** — clips render as colored, labeled,
  clickable blocks positioned by real start/duration; selecting one enables
  the previously-inert Split/Delete toolbar buttons, both wired to the real
  domain operations. Split is only enabled when the playhead is strictly
  inside the selected clip (mirrors `splitClip`'s own validation). New
  `selectedClipId` state added to `editor.store.ts` (UI concern, not
  document state) plus a `project.store.ts` wrapping the timeline package for
  React. Drag-to-move/trim intentionally not built — separate, larger scope.
- **Configurable aspect ratio** — `editor.store.ts` gained `AspectRatio`
  ('9:16' | '3:4' | '4:5' | '16:9') state; `preview-canvas.tsx`'s `Stage` now
  reads it via inline `style.aspectRatio` (Tailwind can't do dynamic arbitrary
  values) with `max-w-full` added so wide ratios contain correctly in a
  portrait window. Selector added to the Settings panel. 2 new tests.
- **Wired "New project"** — auto-incrementing "Untitled project" name +
  dirty flag, visible in the toolbar. No persistence yet. 3 new tests.
- **Wired "Import media"** — real native file picker (Tauri dialog plugin),
  scaffolded `packages/media-engine` with its first real slice (`MediaItem`,
  path→name derivation, 5 tests), media pool state in `editor.store.ts`,
  media list rendering in `left-sidebar.tsx`. Verified: `pnpm verify` (11/11),
  `next build`, and `cargo build` all pass with the plugin registered.
- Found and permanently fixed a recurring bug: every `next build` was
  silently destroying `pnpm-workspace.yaml`'s hand-written comments via
  Next's broken TypeScript auto-install. Patched via `pnpm patch typescript`
  (ADR-0006) — confirmed fixed by a clean rebuild leaving the file untouched.
- Fixed `next build` crash under TypeScript 7 (ADR-0005).
- Settled desktop persistence: SQLite via Rust, Postgres for SaaS (ADR-0004).
- Scaffolded `apps/desktop/src-tauri/`; `cargo build` produces a real, linked
  `videodip.exe`.
- Rust + MSVC toolchain installed and working on this machine.
