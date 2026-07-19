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

- [ ] **Detach Audio (requested 2026-07-19)** — implement as an
      architecture-safe Timeline Engine v2 slice, not a UI-only duplicate.
      One undoable planner transaction must mute the source video clip and
      create a linked audio-role clip from the same media source. Preview,
      Full render, and Fast FFmpeg export must all honor the detached stream;
      the work therefore needs the Phase 6 clip-role/link foundation and the
      Phase 9 linked-A/V and multi-stream export path. Include stream
      eligibility, target-track/collision handling, unlink behavior, undo/redo,
      persistence, and renderer/export parity tests.

- [ ] **Non-destructive visible Gemini watermark removal** (deferred by the
      owner on 2026-07-19 until the active timeline/subtitle phases are
      complete) — select one or multiple video clips, run a cancellable
      progress-reporting cleanup job, import each cleaned result as a new
      media asset, and replace the selected timeline instances in one undoable
      transaction without altering the original files. Before implementation,
      finish the remover license, distribution, runtime, and quality-gate
      review; this feature must not claim to remove invisible SynthID.

- [ ] **Multilingual Whisper acceptance matrix (fixtures + tiny-tier baseline
      shipped 2026-07-19, `scripts/whisper-accuracy/`)** — real accuracy
      fixtures now exist for English, Hindi, Marathi, Tamil, Telugu, Gujarati,
      Bengali, and French, each a real short speech clip + verified transcript
      (FLEURS/OpenSLR, CC BY / CC BY-SA), with a runnable WER harness. The
      `ggml-tiny.bin` baseline run found real, actionable failures: Bengali and
      Telugu hallucinate fluent-but-unrelated text rather than failing loudly;
      Hindi/Marathi/Gujarati come back as Latin transliteration instead of
      native script. **Remaining**: re-run against `small-q5_1` (the app's own
      Recommended tier, not yet tested) before treating any of this as
      validated either way; code-switching fixtures are explicitly deferred
      (see the script's README for why a synthetic concatenation would
      misrepresent real code-switching); performance/timing numbers beyond the
      raw per-clip transcription time captured incidentally. Transcription in
      the source language and translation remain separate features; Whisper
      translation-to-English must not be presented as general
      language-to-language translation.

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

- **Timeline Engine v2 Phase 5 — Track Model (2026-07-19)** — tracks now
  persist visibility, mute, and lock with backward-compatible snapshot
  defaults. State changes use the Phase 4 planner and one-step history;
  locked tracks reject content/transition edits and disable timeline,
  inspector, and preview manipulation. Preview, Full render, Fast export,
  subtitles, and transcription share visibility/mute semantics. Collapse and
  bounded row height live only in `EditingSession`, with pointer and keyboard
  controls in aligned timeline headers/lanes. See
  `docs/timeline-engine-v2-phase-5-track-model.md`. Verified by all 31
  workspace tasks and 573 TypeScript tests, including 116 timeline, 44 shared,
  and 277 desktop tests.

- **Video clip audio controls wired to preview and Full export (2026-07-19)** —
  the inspector, timeline planner/document, persistence, undo, and Fast FFmpeg
  export were already connected, but Remotion applied the computed
  volume/mute/fade callback only to audio-only clips. `OffthreadVideo` now uses
  the same frame-aware volume callback, so video clip volume, mute, fade-in,
  and fade-out behave consistently in desktop preview and composited export.
  A renderer regression test covers base volume, both fades, and mute.
  Verification passes all 31 workspace tasks and 545 TypeScript tests,
  including 33 renderer tests.

- **Timeline Engine v2 Phase 4 — Edit Planner (2026-07-19)** — added the
  framework-free `TimelineEditIntent` and `planTimelineEdit` boundary for every
  currently supported track, clip, transition, animation and audio edit.
  Planning reuses the existing pure operations, deterministic ID providers,
  validation and transaction history; no parallel command system was added.
  The desktop project store keeps its public API but all mutations now follow
  intent → planner → validated transaction → history. Six planner contract
  tests raise timeline coverage to 109 tests. See
  `docs/timeline-engine-v2-phase-4-edit-planner.md`.

- **Saved-project deletion repaired (2026-07-19)** — the Projects panel no
  longer disables Delete for the open snapshot. Deletion remains an explicit
  two-step action; after storage confirms an active-project delete, editor,
  timeline and subtitle state move to a fresh blank project so autosave cannot
  recreate the deleted identity. A failed delete preserves the open project
  unchanged, while inactive deletion leaves the active project alone. Covered
  at the application-command and rendered Projects-panel boundaries; the full
  27-task workspace gate passes with 252 desktop tests.

- **Subtitle timeline multi-selection and Text styles (2026-07-19)** — subtitle
  cues now use the shared `SelectionSet` model: click replaces selection,
  Ctrl/Cmd+click toggles, and Shift+click extends across the ordered subtitle
  lane. Bulk delete and selected/all style application are single subtitle
  history transactions, preserving one-step undo/redo. The former Templates
  panel is now Text styles, with resolved visual previews, selection counts,
  Select all, Set as default, Apply to selected, and Apply to all. Verified by
  the complete 27-task workspace gate, 103 timeline tests, 249 desktop tests,
  repository-wide formatting, and browser interaction QA.

- **Release-bundling gap closed (2026-07-19)** — an installed VideoDip build
  previously had no bundled Node, render CLI, or Chromium, so composited
  export silently fell back to FFmpeg cuts-only. New
  `scripts/provision-node-runtime.ps1` and `scripts/stage-render-resources.ps1`
  produce a pinned, checksum-verified Node sidecar and a portable, pruned
  `@videodip/renderer` plus pre-downloaded Chrome Headless Shell, wired into
  `tauri.release.conf.json`. Also fixed a real bug in `render.rs`: the render
  sidecar's working directory was never set, so Remotion's Chrome-cache
  resolution (which walks up from `cwd`) was inheriting an unrelated
  directory. Verified by actually running both scripts — the first attempt
  produced absolute symlinks into this machine's own path, caught by
  inspection and fixed with `--config.node-linker=hoisted`. See ADR-0011's
  addendum. Not yet verified: a real `tauri build` installer end to end.

- **Media grid/list, source audition and Instagram guides (2026-07-19)** —
  added square, resolution-independent grid cards plus compact list rows with
  accessible view switching. Every item exposes Play immediately before Add;
  Play stops timeline transport and auditions the original video/audio in the
  center stage without changing the timeline. The stage now has square corners
  and a visible on/off Instagram 10%-inset safe frame with thirds. View and
  audition state remain outside persistence and undo. Browser QA also found and
  fixed an unstable multi-selection array selector that prevented the live
  timeline from mounting.

- **Balanced, discoverable workspace resizing (2026-07-19)** — standard video
  editing now opens at 30% library / 40% preview / 30% inspector. Persistent
  divider lines and grips make resizing visible, and short-video now exposes
  both its library and portrait-stage resize boundaries. Its inspector fills
  the complete center pane instead of leaving a fixed-width dead strip. Grid
  media uses an explicit square crop container, so source aspect ratio cannot
  change card geometry.

- **About and license dialog (2026-07-19)** — added an accessible Help →
  About us dialog with the VideoDip version, developer Shantanu Udasi, plain
  `@shantz1` GitHub hyperlink, AGPL-3.0-only notice, complete-license link,
  focus containment, Escape dismissal, and click-outside dismissal.

- **Resizable 40% timeline pane (2026-07-19)** — the lower timeline now uses
  40% of the available editor workspace by default and exposes an accessible
  horizontal splitter for pointer and keyboard resizing. Home or double-click
  restores the proportional default; pane geometry remains view-only and does
  not affect project persistence, dirty state, or undo history.

- **Direct video manipulation + color input recursion fix (2026-07-19)** —
  selected visible video clips now expose source-aspect-correct preview bounds,
  pointer dragging, uniform corner resizing, center snap guides, cancellation,
  and focused keyboard nudging. Pointer movement lives in the non-persisted
  editing session and drives Remotion transiently; release commits one existing
  `updateClipProperties` timeline transaction. Native subtitle color inputs now
  guard duplicate browser events, keep one stable native change listener, and
  skip identical Zustand preview publications, eliminating the maximum-update-
  depth feedback loop. Verified by the full 27-task workspace gate.

- **Media thumbnail fallback + resizable editor panes (2026-07-18)** — made
  the Filmora-style center-preview workspace the default, widened the library
  and inspector defaults, and added pointer/keyboard splitters whose geometry
  remains view-only and outside undo/autosave. Imported videos now decode an
  early source frame while the durable FFmpeg thumbnail is loading or when
  generation fails, instead of degrading immediately to a generic icon and
  “Preview unavailable.” Covered by source-frame, grid, store and splitter
  regression tests.

- **Timeline Engine v2 Phase 1 foundation (2026-07-18)** — versioned the
  timeline aggregate with backward-compatible snapshot migration, centralized
  typed document validation, replaced ambient entity ID generation with
  injectable random/deterministic providers, added non-persisted identity
  indexes, and routed project-store undo/redo through labeled atomic timeline
  transactions. Phase 2 editing-session work remains intentionally untouched.

- **Playhead/preview feedback isolation (2026-07-18)** — stopped unchanged
  timeline seeks from publishing a new Zustand state and decoupled Remotion's
  Player render cycle from per-frame playhead updates through an imperative
  store subscription. This breaks the `seek → frameupdate → render` recursion
  that reached React's maximum update depth while dragging the playhead. Covered
  by store-notification and Player-render regression tests plus browser QA.

- **Subtitle System v2 foundation and professional styling (2026-07-18)** —
  kept `SubtitleDocument` separate from timeline media clips while making it
  mandatory in autosave, centralized missing-field inheritance into one domain
  resolver, migrated legacy nullable styles at the project boundary, and made
  clip/transition/subtitle selection exclusive. Added the complete typography,
  appearance, background, stroke, shadow, layout and transform style surface;
  a compact sectioned inspector with controlled transactional color inputs and
  an extensible offline font catalog with previews/recent fonts; and a stage
  interaction overlay with selection, hover, pointer drag, aspect-correct
  mapping, safe-area guides, snapping, reset and registered keyboard nudges.
  Preview interactions remain transient and create one subtitle-history entry
  only when committed. Verified by domain/schema/renderer/desktop regression
  coverage and the workspace gate.

- **Slider inspector + square output (2026-07-18)** — replaced continuous
  transform, opacity, animation, transition and audio text-only controls with
  accessible sliders plus compact precision values. A drag commits once, so
  undo history stays clean. Added persisted `1:1` project geometry across
  Settings, preview, Remotion and native FFmpeg export; encoding profiles now
  control quality/fps without overriding the selected aspect ratio. Verified
  with all 27 workspace tasks and 352 TypeScript tests.

- **Adjacent-clip transition pipeline (2026-07-18)** — added a persisted,
  plugin-extensible transition model with adjacency and duration invariants,
  timeline cut controls, Effects-inspector editing, shared Remotion preview,
  and native FFmpeg export for crossfade, dip-to-black, slide and wipe styles.
  Timeline edits reconcile or remove invalid transitions, unsupported plugin
  kinds fail before the save dialog, and FFmpeg time bases are normalized to
  prevent accidental frame duplication. Verified with all 27 workspace tasks
  and 352 TypeScript tests plus real exact-duration FFmpeg smoke encodes for
  every built-in transition.

- **Filmora-style editor workspace layouts (2026-07-18)** — added top-toolbar
  Video Editing and Short Video presets that rearrange the complete editor:
  standard video gets a full-width lower timeline, while short-video editing
  keeps both side panels beside a compact center timeline. Workspace choice is
  deliberately independent from the persisted project aspect ratio, does not
  create an autosave revision, and registers Ctrl/Cmd+Shift+L through the
  central shortcut registry. Verified by pure grid mapping, store, toolbar and
  shortcut tests plus the latest all-workspace gate (27 tasks, 352 TypeScript
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
  distribution remain queued. Verified with all 27 workspace tasks (352
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
