# VideoDip — End-to-End Development Tracker

> The single place to see where the whole product stands: every module, every
> phase, from empty repo to shipped editor. Update it in the same PR as the
> work it describes.
>
> How this file relates to the others:
>
> - **`CLAUDE.md`** — the constitution: rules, architecture, non-goals. Never
>   duplicated here; this file tracks _progress against it_.
> - **`docs/PLAN.md`** — the short-horizon working queue (what's being built
>   this week). Feeds into this file as items complete.
> - **`docs/adr/`** — decisions already settled. Referenced by number below.
> - The original product spec lived in the ClipForge SAD/TDD docx files
>   (ClipForge was VideoDip's working title). Their content is fully absorbed
>   into this tracker; the docx files are local-only (`.gitignore`d).

**Legend:** ✅ done · 🔨 in progress / partial · ⬜ not started · 🧭 blocked on a decision (needs an ADR before code)

---

## Product vision

An open-source, AI-powered video editing toolkit for short-form creators —
desktop-first and offline-first, with a full web-based editor as a later
phase. Professional editing plus AI subtitle generation, transcription,
caption styling, silence removal, color grading, and multi-platform export.
Competing with Submagic, VEED, CapCut Desktop, Descript — and, at full
ambition, an "online Filmora."

> **🧭 Scope note (2026-07-17):** the "full online editor" ambition (Phase 6)
> conflicts with `CLAUDE.md`'s current non-goals ("not a cloud rendering
> service", "not account-gated", VPS stays thin). The owner has called this
> direction; it still needs an ADR amending the constitution before Phase 6
> work starts, so the constitution and the code never disagree silently.

---

## Phase overview

| Phase | Scope                                                                    | Status                     |
| ----- | ------------------------------------------------------------------------ | -------------------------- |
| 0     | Foundations — monorepo, tooling, design system, desktop shell            | ✅ done                    |
| 1     | Core editor (desktop) — timeline, media, preview, project persistence    | 🔨 in progress             |
| 2     | Subtitle engine + AI transcription                                       | ⬜ not started (partly 🧭) |
| 3     | Templates, rendering & export                                            | ⬜ not started (partly 🧭) |
| 4     | AI editing tools — silence removal, color grading, auto-captions styling | ⬜ not started             |
| 5     | Plugin ecosystem                                                         | 🔨 contract started        |
| 6     | Web/online editor + accounts + sync ("online Filmora")                   | 🧭 needs ADR first         |
| 7     | Distribution — versioning, auto-update, licensing, marketing site        | ⬜ not started             |

---

## Package-by-package engineering review

The owner-approved review order keeps architectural work deep and verifiable
instead of spreading broad changes across the repository.

| Package / surface | Status | Verified outcome                                                                                                                           |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeline          | ✅     | Generic ordered tracks; open `kind` metadata; add/remove/reorder operations; timing invariants; 41 tests                                   |
| Shared            | ✅     | Segregated media/project/export ports, opaque cross-host locators, versioned project schema, typed transcription readiness; 36 tests       |
| Media Engine      | ✅     | Portable media locators, validated FFprobe metadata, thin Rust process adapter, stricter export boundaries; 24 tests                       |
| Renderer          | ✅     | Serializable validated composition contract; asset media kind separated from open track metadata; shared Player/headless settings; 4 tests |
| Desktop editor    | ✅     | Reusable React editor consumes segregated injected host capabilities; SQLite/browser project adapters share one contract; 107 tests        |
| Plugin SDK        | ✅     | Public v0.1 contract: strict manifests, lifecycle/context, JSON broker protocol, subset grants and authorization; 14 tests                 |

Review sequence completed 2026-07-17. Final gate: all 19 Turbo tasks, optimized
desktop build, Rust formatting/check, and `git diff --check` pass.

## Reference implementations — ideas, not dependencies

These repositories are reviewed for transferable product/engineering ideas.
VideoDip keeps its own architecture, validates licenses before reuse, and does
not copy GPL, restricted, or unclear-license code into the project.

| Reference                                                                                                                                  | Ideas worth carrying into VideoDip                                                                                                        | Guardrail                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [SubVela](https://github.com/zeta-loop/subvela)                                                                                            | Bilingual review workflow, line-by-line timing correction, terminology-aware translation, local/BYOK provider UX, bundled-runtime notices | MIT app, but downloaded NLLB artifacts have separate non-commercial terms; Python runtime does not fit ADR-0007                   |
| [Subtitle Studio](https://github.com/Msoneofficial/SubtitleStudio)                                                                         | Dual-subtitle editing, batch operations, regex search/replace, recent sessions, file associations, subtitle statistics                    | GPL-3.0: study behavior only; do not copy implementation                                                                          |
| [Remotion Subtitles](https://github.com/ahgsql/remotion-subtitles)                                                                         | Declarative animated caption templates, custom caption components, SRT comma/dot timestamp tolerance                                      | MIT; reimplement against VideoDip's typed subtitle/template/plugin contracts                                                      |
| [OpenSub](https://github.com/SivaPA08/opensub)                                                                                             | Local Tauri subtitle workflow, visual timing editor, styling and cross-platform packaging                                                 | GPL-3.0: study behavior only; small/young project, so verify ideas independently                                                  |
| [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit)                                                                              | Waveform/spectrogram timing, linked original+translation edits, visual sync, QC rules, format breadth, autosave/recovery                  | MIT; mature reference, but port concepts through VideoDip domain operations rather than cloning UI                                |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor)                                                                                    | Silence thresholds, configurable lead/trail margins, previewing cuts, reversible timeline output, editor interchange                      | Unlicense core; use algorithms as reference and emit ordinary undoable timeline operations                                        |
| [OpenCut](https://github.com/OpenCut-app/OpenCut)                                                                                          | One Rust-backed codebase across hosts, plugin-first editor API, headless/script/agent surfaces                                            | MIT; currently undergoing a rewrite, so treat architecture claims as directional                                                  |
| [DesignCombo React Video Editor](https://github.com/designcombo/react-video-editor) / [Twick](https://github.com/ncounterspecialist/twick) | Transform handles, layer/effect UX, modular timeline/canvas/player packages, WebCodecs browser-render ideas                               | DesignCombo licensing is not clearly stated in its README; Twick uses SUL. UX/architecture research only unless terms are cleared |

Reference review is ongoing: before implementing a major editor feature, compare
at least one mature specialist tool and one architecture-adjacent open-source
project, then take only behavior that fits VideoDip's offline-first model.

## Phase 0 — Foundations ✅

| Item                                                                                                              | Status | Notes                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| pnpm + Turborepo monorepo, workspace layout per constitution                                                      | ✅     | `apps/*`, `packages/*`                                                                     |
| TypeScript 7 strict mode repo-wide                                                                                | ✅     | ADR-0003; Next build-time typecheck disabled (ADR-0005), `turbo run typecheck` is the gate |
| Version pinning via `catalog:` in `pnpm-workspace.yaml`                                                           | ✅     | Guarded by the typescript patch (ADR-0006) that stops `next build` rewriting the file      |
| `packages/shared` — `Result`, branded types (`ms`, `fps`…), Zod schemas, platform ports                           | ✅     | Zero-dep rule holds; 36 tests; versioned project snapshots validate every storage boundary |
| `packages/ui` — semantic design tokens, motion primitives, theme engine (dark/light/system, persistence, OS sync) | ✅     |                                                                                            |
| `packages/ui` — component primitives                                                                              | 🔨     | Only `Button` so far; more added as features need them                                     |
| Desktop editor shell — layout, panels, transport bar, empty states                                                | ✅     | `apps/desktop`                                                                             |
| Central keyboard-shortcut registry                                                                                | ✅     | 19 tests; constitution requires all shortcuts go through it                                |
| Command palette (shortcut discoverability)                                                                        | ⬜     | Registry is ready for it; no UI yet                                                        |
| Native Tauri shell (`src-tauri`, real `videodip.exe`)                                                             | ✅     | Rust/MSVC toolchain working on the dev machine                                             |
| CI pipeline (verify on push/PR)                                                                                   | ⬜     | GitHub remote exists (github.com/shantz1/VideoDip); no Actions workflow yet                |

## Phase 1 — Core editor (desktop) 🔨

| Item                                                                                                                                                                                      | Status | Notes                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/timeline` — framework-free generic track/clip model (`addTrack`, `removeTrack`, `reorderTrack`, `addClip`, `moveClip`, `trimClip`, `splitClip`, `findFreeStart`, `getDuration`) | ✅     | 41 tests; all fallible ops return `Result`                                                                                                                                             |
| Media import via native file picker                                                                                                                                                       | ✅     | Tauri dialog plugin; media pool in the sidebar                                                                                                                                         |
| Add-to-timeline placement (playhead if free, else first gap)                                                                                                                              | ✅     | `findFreeStart`; no more CONFLICT rejections from the media pool                                                                                                                       |
| Clips rendered on the timeline, select / split / delete                                                                                                                                   | ✅     | Wired to real domain ops                                                                                                                                                               |
| Real media duration on import (probing)                                                                                                                                                   | ✅     | Platform decoder first; validated FFprobe fallback persists full container/stream metadata for undecodable containers                                                                  |
| Drag-to-move and drag-to-trim clips on the timeline                                                                                                                                       | ✅     | Commits through the domain ops, participates in undo/redo, snapping supported                                                                                                          |
| Timeline fit and pointer-anchored zoom                                                                                                                                                    | ✅     | Fit-to-view control plus Ctrl/Cmd + wheel zoom; plain scrolling remains unchanged and zoom shares the store bounds                                                                     |
| Live preview — Remotion player driven by the timeline document                                                                                                                            | ✅     | `apps/renderer` composition + `preview-player.tsx`, two-way transport sync                                                                                                             |
| Configurable aspect ratio (9:16, 3:4, 4:5, 16:9)                                                                                                                                          | ✅     |                                                                                                                                                                                        |
| `packages/media-engine` — portable media identity and metadata                                                                                                                            | ✅     | Opaque host-neutral locators plus normalized container/stream metadata; no filesystem path leaks into the domain                                                                       |
| `packages/media-engine` — FFmpeg export orchestration                                                                                                                                     | 🔨     | Pure validated argument compiler and native progress adapter exist; cancellation/timeouts and stream-aware graphs remain                                                               |
| `packages/media-engine` — FFprobe probing                                                                                                                                                 | ✅     | Pure argv builder/parser with Zod validation; thin Tauri/Rust execution adapter; decoder-first import fallback                                                                         |
| `packages/media-engine` — thumbnails and waveforms                                                                                                                                        | ⬜     | Add cancellable worker/cache pipeline after the renderer boundary is settled                                                                                                           |
| Generic timeline tracks beyond the original three                                                                                                                                         | ✅     | Domain has no default count or closed kind enum; `Track { id, kind, clips[] }`, arbitrary order/kinds, add/remove/reorder; desktop rows and renderer layering derive from the document |
| Clip transform / animation / metadata (per TDD clip model)                                                                                                                                | ⬜     |                                                                                                                                                                                        |
| Project persistence — SQLite via Rust                                                                                                                                                     | ✅     | Bundled SQLite, WAL migration, validated v1 JSON snapshots, CRUD Tauri commands and Rust tests; browser adapter uses the identical repository contract                                 |
| `.videodip` project archive format (project.json, assets, cache, previews, subtitles)                                                                                                     | ⬜     | Per TDD; depends on persistence                                                                                                                                                        |
| Project manager — list, open, autosave                                                                                                                                                    | 🔨     | Debounced autosave and newest-project startup restore are complete; repository list/load/delete exists, but project picker/rename/delete UI remains                                    |
| Undo/redo                                                                                                                                                                                 | ✅     | Past/future history in the project store; toolbar buttons + Ctrl+Z/Ctrl+Shift+Z through the registry                                                                                   |
| Audio engine (volume, fades, waveform display)                                                                                                                                            | ⬜     |                                                                                                                                                                                        |
| Performance budgets measured (cold start < 2 s, scrub 60 fps @ 4K, seek < 100 ms, idle RAM < 400 MB)                                                                                      | ⬜     | Nothing measured yet                                                                                                                                                                   |

## Phase 2 — Subtitle engine + AI transcription

| Item                                                                           | Status | Notes                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/subtitle-engine` — segments, words, styling, timing (framework-free) | ⬜     | Package doesn't exist yet                                                                                                                                                                                                                                                                                 |
| AI transcription runtime                                                       | 🧭     | ADR-0002 names Faster-Whisper/WhisperX (Python), but desktop bundles no Python/Node. Rust-native `whisper.cpp` sidecar is the likely alternative. **ADR required before any code**                                                                                                                        |
| Whisper model download + management UI                                         | ⬜     | Blocked on the runtime ADR                                                                                                                                                                                                                                                                                |
| `TranscriptionProvider` interface in `packages/shared` (DI, swappable)         | ✅     | Host-neutral media locator; capabilities, readiness, progress, cancellation, and all fallible async calls use `Result`                                                                                                                                                                                    |
| Multilingual Whisper language coverage and QA matrix                           | ⬜     | Support every language exposed by the bundled multilingual Whisper model; priority QA: English, Hindi, Marathi, Tamil, Telugu, Gujarati and Bengali, then broader Indic/foreign languages. Include auto-detect, manual override and code-switching tests; never select `.en` models for multilingual work |
| Word-level caption styling + timing editor UI                                  | ⬜     |                                                                                                                                                                                                                                                                                                           |
| Subtitle import/export (SRT, VTT, ASS)                                         | ⬜     |                                                                                                                                                                                                                                                                                                           |
| Subtitles rendered in preview + export via the subtitle track                  | ⬜     | Track already exists in the timeline model                                                                                                                                                                                                                                                                |

## Phase 3 — Templates, rendering & export

| Item                                                                | Status | Notes                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/renderer` — Remotion composition, headless-drivable           | 🔨     | Validated serializable input and dynamic metadata now drive the same composition contract as Player; actual headless process rendering remains blocked on the runtime ADR                                                                                                    |
| Headless export runtime                                             | 🧭     | `@remotion/renderer` needs Node; desktop has none (ADR-0004 world). Likely a Tauri sidecar process. **ADR required.** Same issue blocks BullMQ/Redis on desktop                                                                                                              |
| Export pipeline: timeline → FFmpeg encode → MP4 on disk             | ✅     | v0.1 cuts-only path shipped 2026-07-17: pure argv builder in `media-engine` (tested), Rust `export_video` command, verified against real FFmpeg (exact-duration 1080×1920 output). Remotion-composited export (subtitles/effects burned in) still needs the Node-sidecar ADR |
| Multi-platform export presets (TikTok/Reels/Shorts sizes, bitrates) | 🔨     | Aspect-ratio-driven geometry (1080 short edge) shipped; named presets/bitrate tiers not                                                                                                                                                                                      |
| Real progress reporting during export (percentage, not spinner)     | ✅     | FFmpeg `-progress` parsed in Rust, streamed to the UI as a percentage                                                                                                                                                                                                        |
| `packages/template-engine` — template resolution/composition        | ⬜     | Package doesn't exist yet                                                                                                                                                                                                                                                    |
| Templates as Zod-validated JSON (data, not code)                    | ⬜     |                                                                                                                                                                                                                                                                              |
| Export history                                                      | ⬜     | Per TDD DB schema                                                                                                                                                                                                                                                            |

## Phase 4 — AI editing tools

| Item                                            | Status | Notes                                                                                                                |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Silence removal (detect + cut via timeline ops) | ⬜     |                                                                                                                      |
| Color grading (user-requested 2026-07-17)       | ⬜     | Needs design: LUT-based grading in the Remotion/GL pipeline vs FFmpeg filters; GPU-accelerated per performance rules |
| Auto-captions with styled templates             | ⬜     | Depends on Phases 2–3                                                                                                |
| AI provider interface (local-first, swappable)  | ⬜     | Providers never referenced from frontend code                                                                        |
| AI B-roll, brand kits, workflow automation      | ⬜     | "Future enhancements" from the TDD; far horizon                                                                      |

## Phase 5 — Plugin ecosystem

| Item                                                                                  | Status | Notes                                                              |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `packages/plugin-sdk` — manifest, lifecycle and capability broker contract            | ✅     | Public semver-governed package; strict Zod boundaries and 14 tests |
| Isolated plugin runtime, quotas, signatures and crash recovery                        | ⬜     | ADR-0009 requires isolation; SDK explicitly is not the sandbox     |
| Plugin surfaces: templates, transitions, effects, fonts, AI providers, export presets | ⬜     |                                                                    |
| Plugin/template registry (served by `apps/api`)                                       | ⬜     |                                                                    |
| Plugin manager UI                                                                     | ⬜     | Sidebar panel placeholder exists                                   |

## Phase 6 — Web/online editor 🧭

> Blocked on the scope ADR (see Product vision note) before any code.

| Item                                                                   | Status | Notes                                                                                                            |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| ADR: amend constitution non-goals for the online editor                | ⬜     | The gate for this whole phase                                                                                    |
| Browser-based editor (reuse `apps/desktop`'s Next.js UI without Tauri) | ⬜     | The editor UI is already Next.js; the gap is media access, persistence, and rendering without local FFmpeg/Tauri |
| Accounts + auth                                                        | ⬜     | `apps/api`; desktop must stay fully usable logged-out and offline                                                |
| Cloud project sync (desktop ↔ web)                                     | ⬜     | Postgres side of ADR-0004                                                                                        |
| Server-side transcription/rendering for web users                      | ⬜     | This is the "cloud rendering" the constitution currently forbids — hence the ADR                                 |

## Phase 7 — Distribution

| Item                                                                                       | Status | Notes                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioning scheme (semver from Conventional Commits)                                       | ⬜     | User requirement (2026-07-17)                                                                                                                                                                                                                     |
| **Automatic client updates** — download _and apply_ when an update exists, not just notify | ⬜     | User requirement, stated twice. `tauri-plugin-updater` + signed manifests; GitHub Releases can host the update feed until `apps/api` is real. Offline-tolerant: unreachable feed must never degrade the editor. Signing key never enters the repo |
| Release pipeline (build, sign, publish per-platform bundles)                               | ⬜     | Prerequisite for auto-update                                                                                                                                                                                                                      |
| `apps/api` — licensing, registry, update feed (deliberately thin)                          | ⬜     | Empty directory                                                                                                                                                                                                                                   |
| `apps/web` — marketing site + landing page                                                 | ⬜     | Empty directory                                                                                                                                                                                                                                   |
| `apps/worker` — BullMQ consumers (server-side only)                                        | ⬜     | Empty directory; desktop can't use Redis                                                                                                                                                                                                          |

---

## Decision log (ADRs)

| ADR  | Decision                                                           | Status                            |
| ---- | ------------------------------------------------------------------ | --------------------------------- |
| 0001 | Record architecture decisions                                      | ✅ accepted                       |
| 0002 | Local compute, thin server                                         | ✅ accepted                       |
| 0003 | TypeScript 7 + declaration builds                                  | ✅ accepted                       |
| 0004 | SQLite via Rust on desktop, Postgres for SaaS                      | ✅ accepted                       |
| 0005 | Next build-time typecheck disabled under TS 7                      | ✅ accepted                       |
| 0006 | Patch typescript for Next's sentinel file                          | ✅ accepted                       |
| 0008 | One shared editor core with thin desktop/browser adapters          | ✅ accepted                       |
| 0009 | Capability-brokered, JSON-only plugin boundary                     | ✅ accepted                       |
| 0007 | AI transcription runtime: whisper.cpp sidecar and on-demand models | 🧭 proposed; needs owner sign-off |
| —    | Headless export runtime (Node sidecar for Remotion)                | 🧭 needed                         |
| —    | Online editor scope (amends non-goals)                             | 🧭 needed                         |
| —    | Release/auto-update pipeline                                       | 🧭 needed                         |
