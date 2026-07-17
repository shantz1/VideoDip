# VideoDip — End-to-End Development Tracker

> The single place to see where the whole product stands: every module, every
> phase, from empty repo to shipped editor. Update it in the same PR as the
> work it describes.
>
> How this file relates to the others:
> - **`CLAUDE.md`** — the constitution: rules, architecture, non-goals. Never
>   duplicated here; this file tracks *progress against it*.
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

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundations — monorepo, tooling, design system, desktop shell | ✅ done |
| 1 | Core editor (desktop) — timeline, media, preview, project persistence | 🔨 in progress |
| 2 | Subtitle engine + AI transcription | ⬜ not started (partly 🧭) |
| 3 | Templates, rendering & export | ⬜ not started (partly 🧭) |
| 4 | AI editing tools — silence removal, color grading, auto-captions styling | ⬜ not started |
| 5 | Plugin ecosystem | ⬜ not started |
| 6 | Web/online editor + accounts + sync ("online Filmora") | 🧭 needs ADR first |
| 7 | Distribution — versioning, auto-update, licensing, marketing site | ⬜ not started |

---

## Phase 0 — Foundations ✅

| Item | Status | Notes |
| --- | --- | --- |
| pnpm + Turborepo monorepo, workspace layout per constitution | ✅ | `apps/*`, `packages/*` |
| TypeScript 7 strict mode repo-wide | ✅ | ADR-0003; Next build-time typecheck disabled (ADR-0005), `turbo run typecheck` is the gate |
| Version pinning via `catalog:` in `pnpm-workspace.yaml` | ✅ | Guarded by the typescript patch (ADR-0006) that stops `next build` rewriting the file |
| `packages/shared` — `Result`, branded types (`ms`, `fps`…), Zod | ✅ | Zero-dep rule holds; 24 tests |
| `packages/ui` — semantic design tokens, motion primitives, theme engine (dark/light/system, persistence, OS sync) | ✅ | |
| `packages/ui` — component primitives | 🔨 | Only `Button` so far; more added as features need them |
| Desktop editor shell — layout, panels, transport bar, empty states | ✅ | `apps/desktop` |
| Central keyboard-shortcut registry | ✅ | 19 tests; constitution requires all shortcuts go through it |
| Command palette (shortcut discoverability) | ⬜ | Registry is ready for it; no UI yet |
| Native Tauri shell (`src-tauri`, real `videodip.exe`) | ✅ | Rust/MSVC toolchain working on the dev machine |
| CI pipeline (verify on push/PR) | ⬜ | GitHub remote exists (github.com/shantz1/VideoDip); no Actions workflow yet |

## Phase 1 — Core editor (desktop) 🔨

| Item | Status | Notes |
| --- | --- | --- |
| `packages/timeline` — framework-free domain model (`addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`, `findFreeStart`, `getDuration`) | ✅ | 32 tests; all fallible ops return `Result` |
| Media import via native file picker | ✅ | Tauri dialog plugin; media pool in the sidebar |
| Add-to-timeline placement (playhead if free, else first gap) | ✅ | `findFreeStart`; no more CONFLICT rejections from the media pool |
| Clips rendered on the timeline, select / split / delete | ✅ | Wired to real domain ops |
| Real media duration on import (probing) | 🔨 | **Current "Now" item.** Every clip is a placeholder 5 s until `media-engine` probes files (FFmpeg/ffprobe behind a Tauri command) |
| Drag-to-move and drag-to-trim clips on the timeline | ⬜ | Domain ops exist; UI interaction not built |
| Live preview — Remotion player driven by the timeline document | ✅ | `apps/renderer` composition + `preview-player.tsx`, two-way transport sync |
| Configurable aspect ratio (9:16, 3:4, 4:5, 16:9) | ✅ | |
| `packages/media-engine` — `MediaItem` slice | ✅ | 5 tests |
| `packages/media-engine` — FFmpeg orchestration, probing, thumbnails, waveforms | ⬜ | The package's real job; nothing yet |
| Timeline tracks beyond the fixed three (Overlay, Effects — per TDD) | ⬜ | Model currently fixes Video/Subtitle/Audio |
| Clip transform / animation / metadata (per TDD clip model) | ⬜ | |
| Project persistence — SQLite via Rust | 🧭→⬜ | Decision made (ADR-0004); implementation not started |
| `.videodip` project archive format (project.json, assets, cache, previews, subtitles) | ⬜ | Per TDD; depends on persistence |
| Project manager — list, open, autosave | 🔨 | "New project" (name + dirty flag) only; no save/load/list |
| Undo/redo | ⬜ | Constitution: every destructive action undoable or confirmed |
| Audio engine (volume, fades, waveform display) | ⬜ | |
| Performance budgets measured (cold start < 2 s, scrub 60 fps @ 4K, seek < 100 ms, idle RAM < 400 MB) | ⬜ | Nothing measured yet |

## Phase 2 — Subtitle engine + AI transcription

| Item | Status | Notes |
| --- | --- | --- |
| `packages/subtitle-engine` — segments, words, styling, timing (framework-free) | ⬜ | Package doesn't exist yet |
| AI transcription runtime | 🧭 | ADR-0002 names Faster-Whisper/WhisperX (Python), but desktop bundles no Python/Node. Rust-native `whisper.cpp` sidecar is the likely alternative. **ADR required before any code** |
| Whisper model download + management UI | ⬜ | Blocked on the runtime ADR |
| `TranscriptionProvider` interface in `packages/shared` (DI, swappable) | ⬜ | Interface-first, per constitution |
| Word-level caption styling + timing editor UI | ⬜ | |
| Subtitle import/export (SRT, VTT, ASS) | ⬜ | |
| Subtitles rendered in preview + export via the subtitle track | ⬜ | Track already exists in the timeline model |

## Phase 3 — Templates, rendering & export

| Item | Status | Notes |
| --- | --- | --- |
| `apps/renderer` — Remotion composition, headless-drivable | 🔨 | Composition exists and drives the preview; headless rendering not exercised |
| Headless export runtime | 🧭 | `@remotion/renderer` needs Node; desktop has none (ADR-0004 world). Likely a Tauri sidecar process. **ADR required.** Same issue blocks BullMQ/Redis on desktop |
| Export pipeline: timeline → composition → FFmpeg encode → file | ⬜ | Per TDD rendering pipeline |
| Multi-platform export presets (TikTok/Reels/Shorts sizes, bitrates) | ⬜ | |
| Real progress reporting during export (percentage, not spinner) | ⬜ | Constitution requirement |
| `packages/template-engine` — template resolution/composition | ⬜ | Package doesn't exist yet |
| Templates as Zod-validated JSON (data, not code) | ⬜ | |
| Export history | ⬜ | Per TDD DB schema |

## Phase 4 — AI editing tools

| Item | Status | Notes |
| --- | --- | --- |
| Silence removal (detect + cut via timeline ops) | ⬜ | |
| Color grading (user-requested 2026-07-17) | ⬜ | Needs design: LUT-based grading in the Remotion/GL pipeline vs FFmpeg filters; GPU-accelerated per performance rules |
| Auto-captions with styled templates | ⬜ | Depends on Phases 2–3 |
| AI provider interface (local-first, swappable) | ⬜ | Providers never referenced from frontend code |
| AI B-roll, brand kits, workflow automation | ⬜ | "Future enhancements" from the TDD; far horizon |

## Phase 5 — Plugin ecosystem

| Item | Status | Notes |
| --- | --- | --- |
| `packages/plugin-sdk` — manifest, lifecycle hooks, sandboxing, capabilities | ⬜ | Package doesn't exist yet; semver-stable public contract |
| Plugin surfaces: templates, transitions, effects, fonts, AI providers, export presets | ⬜ | |
| Plugin/template registry (served by `apps/api`) | ⬜ | |
| Plugin manager UI | ⬜ | Sidebar panel placeholder exists |

## Phase 6 — Web/online editor 🧭

> Blocked on the scope ADR (see Product vision note) before any code.

| Item | Status | Notes |
| --- | --- | --- |
| ADR: amend constitution non-goals for the online editor | ⬜ | The gate for this whole phase |
| Browser-based editor (reuse `apps/desktop`'s Next.js UI without Tauri) | ⬜ | The editor UI is already Next.js; the gap is media access, persistence, and rendering without local FFmpeg/Tauri |
| Accounts + auth | ⬜ | `apps/api`; desktop must stay fully usable logged-out and offline |
| Cloud project sync (desktop ↔ web) | ⬜ | Postgres side of ADR-0004 |
| Server-side transcription/rendering for web users | ⬜ | This is the "cloud rendering" the constitution currently forbids — hence the ADR |

## Phase 7 — Distribution

| Item | Status | Notes |
| --- | --- | --- |
| Versioning scheme (semver from Conventional Commits) | ⬜ | User requirement (2026-07-17) |
| **Automatic client updates** — download *and apply* when an update exists, not just notify | ⬜ | User requirement, stated twice. `tauri-plugin-updater` + signed manifests; GitHub Releases can host the update feed until `apps/api` is real. Offline-tolerant: unreachable feed must never degrade the editor. Signing key never enters the repo |
| Release pipeline (build, sign, publish per-platform bundles) | ⬜ | Prerequisite for auto-update |
| `apps/api` — licensing, registry, update feed (deliberately thin) | ⬜ | Empty directory |
| `apps/web` — marketing site + landing page | ⬜ | Empty directory |
| `apps/worker` — BullMQ consumers (server-side only) | ⬜ | Empty directory; desktop can't use Redis |

---

## Decision log (ADRs)

| ADR | Decision | Status |
| --- | --- | --- |
| 0001 | Record architecture decisions | ✅ accepted |
| 0002 | Local compute, thin server | ✅ accepted |
| 0003 | TypeScript 7 + declaration builds | ✅ accepted |
| 0004 | SQLite via Rust on desktop, Postgres for SaaS | ✅ accepted |
| 0005 | Next build-time typecheck disabled under TS 7 | ✅ accepted |
| 0006 | Patch typescript for Next's sentinel file | ✅ accepted |
| — | AI transcription runtime (whisper.cpp sidecar vs bundled Python) | 🧭 needed |
| — | Headless export runtime (Node sidecar for Remotion) | 🧭 needed |
| — | Online editor scope (amends non-goals) | 🧭 needed |
| — | Release/auto-update pipeline | 🧭 needed |
