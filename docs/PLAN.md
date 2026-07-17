# Working plan — desktop editor shell

A living checklist, not a decision record (see `docs/adr/` for those). Updated
as items complete or new ones surface. Worked one at a time, per `CLAUDE.md`'s
"one feature at a time, completely" rule. The end-to-end picture across all
phases lives in the root `TRACKER.md`; this file is only the short horizon.

## Now

- [ ] **Project browser + portable `.videodip` archives** — durable local
      snapshots and autosave are complete. Add the list/open/rename/delete UI,
      then the portable archive container (`project.json`, subtitles, previews,
      cache manifest and optional packaged assets) without changing the shared
      editor state model.
- [ ] **Cancellable media workers** — add cancellation/timeouts and bounded
      concurrency before thumbnail and waveform generation. The worker/cache
      pipeline must stay behind the Media Engine ports and be measured before
      optimization.

## Queued (user-requested, not yet started)

- [ ] **Multilingual Whisper acceptance matrix** — all languages exposed by
      the bundled multilingual model remain selectable, with explicit
      accuracy/performance fixtures for English, Hindi, Marathi, Tamil, Telugu,
      Gujarati and Bengali plus code-switching and a representative foreign
      language set. Transcription in the source language and translation are
      separate features; Whisper translation-to-English must not be presented
      as general language-to-language translation.

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
      Node _and_ no Python runtime bundled, so shipping either means bundling
      a Python distribution inside a Tauri app — a real architectural cost
      nobody has signed off on. A Rust-native alternative (e.g. `whisper.cpp`
      as a Tauri sidecar binary, downloading GGML model files directly) avoids
      that entirely but changes the named runtime in ADR-0002. Needs an ADR
      before implementation starts, not just a wired button.

## Done (this session, 2026-07-17)

- **Durable project snapshots + autosave** — added a strict versioned project
  schema, bundled SQLite/WAL storage and CRUD commands in Rust, matching Tauri
  and browser repositories behind the shared `ProjectRepository` port, newest
  project restore, and 750 ms debounced autosave. Revision-aware save
  completion cannot mark newer edits clean. Storage failures remain visible
  and recoverable; portable `.videodip` archives and the project-picker UI are
  intentionally still queued.

- **Package-by-package architecture pass complete** — Timeline, Shared, Media
  Engine, Renderer, Desktop editor, and Plugin SDK were reviewed in the agreed
  order and left independently testable. Final verification passes all 19
  Turbo tasks, the optimized Next desktop build, Rust formatting/check, and
  `git diff --check`.

- **Plugin SDK contract (ADR-0009)** — added the public
  `@videodip/plugin-sdk` workspace with strict namespaced/semver manifests,
  declared extension surfaces, capability-subset grants, per-request
  authorization, JSON-only host/sandbox messages, cancellation-aware lifecycle
  context, and 14 tests. The SDK does not pretend to execute untrusted code;
  isolation, signatures, quotas, timeouts, and crash recovery remain explicit
  runtime work before third-party plugins can be enabled.

- **Desktop editor deep review** — the reusable React editor no longer imports
  Tauri APIs. Media import/source resolution, export, and fullscreen are
  segregated host capabilities injected through one provider selected at the
  application boundary. A browser adapter can replace capabilities without
  copying UI, stores, controllers, or domain packages. The existing browser
  preview still reports unsupported import/export until those adapters are
  implemented. Verified with 93 desktop tests and typecheck.

- **Renderer deep review** — track metadata no longer decides render behavior;
  each resolved asset supplies its own video/audio capability, so arbitrary
  overlay/plugin track kinds render correctly. Composition clips and settings
  now form one Zod-validated serializable contract, and Remotion metadata uses
  the same fps/dimensions/duration passed to the live Player. Stable memoized
  Player props avoid unnecessary media resets during playhead updates. Renderer
  has its first 4 contract/dispatch tests.
- **Ctrl/Cmd + wheel timeline zoom** — scrolling over the timeline while the
  platform modifier is held zooms through the existing bounded store actions,
  prevents browser page zoom, and preserves the time beneath the pointer.
  Plain scrolling is untouched; desktop now passes 91 tests.

- **Media Engine deep review** — media identity now uses opaque cross-host
  locators instead of desktop paths; imports retain normalized container and
  stream metadata; FFprobe argument building and Zod parsing stay pure; and a
  thin Rust/Tauri adapter performs native probing only when the platform decoder
  cannot. Export compilation rejects invalid inputs before process launch.
  Verified with 24 Media Engine tests, 89 desktop tests, Rust formatting/check,
  the full 17-task workspace verification, and a production desktop build.

- **Shared package deep review** — added Zod validation schemas for branded
  units and identifiers; segregated media import/source, project repository,
  and video export ports for desktop/browser substitution; introduced opaque
  media locators; and corrected transcription capability/readiness methods to
  return typed `Result`s. Shared remains React/Tauri/browser/provider-free and
  passes 31 tests.
- **Repository formatting restored** — the existing Prettier config required
  `prettier-plugin-tailwindcss` but the package was absent. Version 0.8.1 is now
  catalog-pinned and installed, and changed files format successfully.

- **Generic, extensible timeline tracks** — removed the domain's fixed
  Video/Subtitle/Audio invariant. Tracks now have open `kind` metadata and
  arbitrary count/order, with pure add/remove/reorder operations. Empty-track
  removal is safe; non-empty removal is rejected. Desktop rows derive from the
  document, media placement resolves a track by kind rather than assuming its
  id, and renderer layer order derives from track order. Timing boundaries now
  reject negative, zero-length, NaN, and infinite values. Verified with 41
  timeline tests, 87 desktop tests, and typechecks across timeline, renderer,
  and desktop.
- **Visible timeline clips + fit control** — clip backgrounds now use generated
  semantic track-color utilities in dark and light themes. Plugin-defined kinds
  get a visible accent fallback. A measured “Fit timeline to view” control sits
  before Zoom Out and derives zoom from viewport width and project duration. A
  Filmora-style scissors control on the playhead splits the selected clip at
  that exact time through the same undoable timeline operation.
- **One editor architecture accepted (ADR-0008)** — reusable editor
  UI/state/controllers will be shared; Tauri and browser behavior lives in thin
  injected adapters. This does not authorize cloud rendering or account gating.

- **Core editor interactions wired end to end** — real media type/duration,
  correct audio/video track routing, project-derived transport duration,
  subtitle/video/audio visual stacking, bottom-to-top render ordering, clip
  move/trim with snapping, editable inspector properties, undo/redo commands
  and shortcuts, fullscreen, command menus, and native FFmpeg export progress.

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
- **Media pool → timeline** — a "+" affordance per media item places it on the
  matching audio/video track at the playhead with decoded duration when
  available; failures surface as an inline alert, not a swallowed error.
- **Real clips in `timeline-panel.tsx`** — clips render as colored, labeled,
  clickable blocks positioned by real start/duration; selecting one enables
  the previously-inert Split/Delete toolbar buttons, both wired to the real
  domain operations. Split is only enabled when the playhead is strictly
  inside the selected clip (mirrors `splitClip`'s own validation). New
  `selectedClipId` state added to `editor.store.ts` (UI concern, not
  document state) plus a `project.store.ts` wrapping the timeline package for
  React. Drag-to-move and edge trimming now commit through the same domain
  operations and participate in undo/redo history.
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
