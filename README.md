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

**Early development.** The architecture and foundations are in place; the
editor is not yet built. See [`docs/adr/`](./docs/adr) for the decisions made
so far and [`CLAUDE.md`](./CLAUDE.md) for how the project is built.

## Requirements

| Tool         | Version | Needed for                  |
| ------------ | ------- | --------------------------- |
| Node         | ≥ 22.11 | everything                  |
| pnpm         | ≥ 10    | everything                  |
| Rust + Cargo | stable  | `apps/desktop` (Tauri) only |
| FFmpeg       | ≥ 6     | media processing            |
| Python       | 3.11+   | local Whisper transcription |

## Getting started

```bash
pnpm install
pnpm verify     # typecheck + lint + test
pnpm dev
```

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
