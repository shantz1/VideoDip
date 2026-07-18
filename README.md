<div align="center">

# VideoDip

**Professional AI Video Editing. Built for Modern Creators.**

Generate subtitles, edit videos, remove silence, add animations, and export
beautiful social content — all locally.

</div>

---

## What this is

VideoDip is an open-source, offline-first, AI-powered desktop video editing
toolkit for short-form creators. Your media never leaves your machine. No
uploads, no per-minute quotas, no account required, and it works on a plane.

It is a creator platform, not a subtitle generator — subtitles are one module
among many.

## Status

**Active development.** The reusable desktop/browser editor core, timeline,
preview, project persistence, local Whisper subtitles, templates, and native
export pipeline are implemented. See [`TRACKER.md`](./TRACKER.md) for verified
progress and [`docs/PLAN.md`](./docs/PLAN.md) for the current queue.

## Requirements

| Tool         | Version | Needed for                  |
| ------------ | ------- | --------------------------- |
| Node         | ≥ 22.11 | everything                  |
| pnpm         | ≥ 10    | everything                  |
| Rust + Cargo | stable  | `apps/desktop` (Tauri) only |
| FFmpeg       | ≥ 6     | media processing            |
| PowerShell   | 5.1+    | Windows command runner      |

## Getting started

```powershell
.\videodip.ps1 setup
.\videodip.ps1 verify
.\videodip.ps1 desktop
```

If local PowerShell policy blocks scripts, use the equivalent explicit form:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\videodip.ps1 desktop
```

## Root command guide

Run every development workflow from the repository root. The command runner
changes to the correct directory itself and stops when an underlying command
fails.

| Command                        | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `.\videodip.ps1 help`          | Print the complete command list                    |
| `.\videodip.ps1 setup`         | Install pnpm workspace dependencies                |
| `.\videodip.ps1 web`           | Run the browser UI at `http://localhost:3100`      |
| `.\videodip.ps1 desktop`       | Run the native Tauri editor                        |
| `.\videodip.ps1 verify`        | Typecheck, lint, and test every workspace          |
| `.\videodip.ps1 test`          | Run all Vitest suites                              |
| `.\videodip.ps1 typecheck`     | Run strict TypeScript checks                       |
| `.\videodip.ps1 format`        | Format source and documentation                    |
| `.\videodip.ps1 build`         | Build all TypeScript/Next workspaces               |
| `.\videodip.ps1 package`       | Build the Windows desktop installer                |
| `.\videodip.ps1 ai`            | Provision the pinned Windows Whisper runtime       |
| `.\videodip.ps1 clean-preview` | Report generated folders and reclaimable size      |
| `.\videodip.ps1 clean`         | Remove generated caches and build output           |
| `.\videodip.ps1 clean-all`     | Also remove `node_modules`; run `setup` afterwards |

### Reclaiming development disk space

Rust debug output is normally the largest folder. To inspect before deleting:

```powershell
.\videodip.ps1 clean-preview
```

Then close running VideoDip, Next, and Cargo processes and run:

```powershell
.\videodip.ps1 clean
```

This removes generated `.next`, `.turbo`, `.cache`, `dist`, `build`, `out`,
coverage, TypeScript build-info, and Cargo `target` folders throughout the
repository. It preserves source code, Git data, installed dependencies,
projects, media, the bundled Whisper executable, and downloaded Whisper
models. Use `clean-all` only when you also want to reinstall `node_modules`.

Direct pnpm equivalents are `pnpm clean:check`, `pnpm clean`, and
`pnpm clean:all`.

## Layout

```
apps/
  desktop     Tauri shell + Next.js editor UI — the product
  web         Marketing site
  api         NestJS: licensing, plugin registry, sync (deliberately thin)
  renderer    Remotion compositions, headless-drivable
  worker      BullMQ consumers for transcription and export
packages/
  ui                Design system: tokens, primitives, motion
  timeline          Timeline data model — framework-free
  subtitle-engine   Segments, words, styling, timing — framework-free
  media-engine      FFmpeg orchestration, probing, thumbnails
  template-engine   Template resolution and composition
  plugin-sdk        Public plugin contract, semver-stable
  shared            Types, interfaces, schemas — zero dependencies
```

Dependencies point inward: `apps/*` → `packages/*` → `packages/shared`.
Domain packages never import from apps, and never import React.

## Contributing

Read [`CLAUDE.md`](./CLAUDE.md) first — it is the project constitution and
applies to humans and coding agents alike.

## License

AGPL-3.0-only.
