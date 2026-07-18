# Working plan — desktop editor shell

A living checklist, not a decision record (see `docs/adr/` for those). Updated
as items complete or new ones surface. Worked one at a time, per `CLAUDE.md`'s
"one feature at a time, completely" rule. The end-to-end picture across all
phases lives in the root `TRACKER.md`; this file is only the short horizon.

## Now

- [ ] **Next unblocked product batch** — measure the published performance
      budgets, add durable export history, implement reversible silence-removal
      suggestions, design and implement GPU-safe color grading, and build the
      plugin manager/runtime isolation required by ADR-0009.

- [ ] **Decision review** — remaining runtime/infrastructure work is gated by
      approval for Remotion's headless sidecar, online/cloud scope, and signed
      release/auto-update infrastructure. ADR-0007 is accepted and its Windows
      CPU Whisper path is implemented.

## Queued (decision-gated or requires product infrastructure)

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

## Done (this session, 2026-07-17)

- **Adjacent-clip transition pipeline (2026-07-18)** — added a persisted,
  plugin-extensible transition model with adjacency and duration invariants,
  timeline cut controls, Effects-inspector editing, shared Remotion preview,
  and native FFmpeg export for crossfade, dip-to-black, slide and wipe styles.
  Timeline edits reconcile or remove invalid transitions, unsupported plugin
  kinds fail before the save dialog, and FFmpeg time bases are normalized to
  prevent accidental frame duplication. Verified with all 27 workspace tasks
  and 338 TypeScript tests plus real exact-duration FFmpeg smoke encodes for
  every built-in transition.

- **Filmora-style editor workspace layouts (2026-07-18)** — added top-toolbar
  Video Editing and Short Video presets that rearrange the complete editor:
  standard video gets a full-width lower timeline, while short-video editing
  keeps both side panels beside a compact center timeline. Workspace choice is
  deliberately independent from the persisted project aspect ratio, does not
  create an autosave revision, and registers Ctrl/Cmd+Shift+L through the
  central shortcut registry. Verified by pure grid mapping, store, toolbar and
  shortcut tests plus the latest all-workspace gate (27 tasks, 338 TypeScript
  tests).

- **Local multilingual AI subtitles (2026-07-18)** — accepted ADR-0007 and
  implemented the Windows CPU whisper.cpp sidecar path, verified runtime/model
  downloads, real progress and cancellation, injected provider/model ports,
  trimmed-clip timestamp mapping, automatic subtitle timeline insertion, all
  99 supported language choices, global/per-cue colors, and reusable caption
  entrance animations. The later 15% generation stall is fixed: the Rust host
  now streams whisper.cpp's carriage-return progress updates immediately, and
  its full-JSON parser accepts zero-length control tokens while retaining strict
  timing for real segments. Cross-language accuracy fixtures and non-Windows/GPU
  distribution remain queued. Verified with all 27 workspace tasks (338
  TypeScript tests), 18 Rust tests, optimized desktop/web builds, the pinned runtime
  provisioning command, and an isolated Tauri build containing the sidecar and
  its runtime DLLs.

- **Integrated editor feature batch (2026-07-18)** — completed clip transforms,
  metadata, keyframes and audio fades; cached waveform display; command palette;
  CI; persisted subtitle documents with word timing, shared timeline/preview
  rendering and SRT/WebVTT/ASS interchange; strict data-only template engine
  with built-in caption styles; and named delivery presets. Verified with all
  25 workspace tasks, 303 TypeScript tests, an optimized Next build, 14 Rust
  tests, Rust formatting and `git diff --check`.

- **Cancellable FFmpeg exports** — long-running exports now share the native
  task registry with derived media, including cancellation remembered before
  child-process activation. Progress events are scoped to a task id, a
  30-minute host timeout terminates FFmpeg, the toolbar exposes a visible
  Cancel action, and Escape is registered centrally. Cancellation is a normal
  user outcome; timeout remains a recoverable typed error. Verified with 14
  Rust tests, 125 Desktop tests, Rust formatting/check and desktop typecheck.

- **Cancellable thumbnails + waveform cache** — added a framework-free,
  cache-first Media Engine service with Zod-validated requests/results,
  bounded concurrency, queue-inclusive timeouts, process cancellation and
  monotonic progress. The desktop Rust host streams source files through
  FFmpeg, writes only bounded derived data, rejects unsafe staging/cache paths,
  and atomically commits hashed cache directories. Video and audio library rows
  now show thumbnail/waveform generation progress, recoverable errors and cache
  readiness through the same injected editor host used by desktop/browser.
  Verified with 33 Media Engine tests, 125 Desktop tests, 14 Rust tests and all
  19 workspace verification tasks.

- **Portable `.videodip` project archives** — added a documented, versioned
  standard-ZIP container with linked and portable export modes, streamed and
  de-duplicated embedded media, atomic destination replacement, and a
  two-phase inspect/validate/import flow. Import rejects traversal, absolute or
  non-normal paths, duplicate/unreferenced entries, unsupported versions,
  excessive entry/size declarations, malformed snapshots, metadata mismatch,
  and archive changes between validation and extraction. The shared host port,
  desktop adapters, application commands, sidebar/project-menu controls,
  progress/error states and central shortcuts use the same editor core. The
  browser adapter returns a typed unsupported result until durable browser
  media storage exists. Verified with 8 Rust tests, 37 Shared tests, and 121
  Desktop tests; the format is specified in `docs/project-format.md`.

- **Local project manager** — the Projects panel lists saved snapshots and can
  open, rename, and two-step-delete inactive projects. New/open commands flush
  dirty state before replacing the active document, closing the autosave
  debounce data-loss window. The panel passed browser interaction QA and fits
  its 240 px sidebar without horizontal overflow.

- **Durable project snapshots + autosave** — added a strict versioned project
  schema, bundled SQLite/WAL storage and CRUD commands in Rust, matching Tauri
  and browser repositories behind the shared `ProjectRepository` port, newest
  project restore, and 750 ms debounced autosave. Revision-aware save
  completion cannot mark newer edits clean. Storage failures remain visible
  and recoverable; the project-picker UI and portable `.videodip` archive flow
  are now complete.

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
