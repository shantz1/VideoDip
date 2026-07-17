# ADR-0004: SQLite in the Rust shell on the desktop; Postgres for the SaaS

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

`CLAUDE.md` names the persistence layer as "SQLite (dev + desktop), PostgreSQL
(VPS)". That is an intent, not a decision — no rationale, no access layer, no
schema, and no dependency in any manifest. This ADR settles it.

Two constraints drive the answer, and they point the same way.

**The distribution model.** VideoDip ships as a downloadable Windows executable
and as source that a contributor clones and builds. Both must work with no
install step, no daemon, no service to configure, and no network — per ADR-0002,
the editor is fully functional with the cable unplugged.

**The desktop app has no Node runtime.** `apps/desktop/next.config.ts` sets
`output: 'export'`: Tauri serves the frontend as static files from the app
bundle. There is no Node server in a desktop install. The webview runs the
editor; the Rust shell owns everything that touches the OS.

That second constraint is decisive, and it is easy to miss. The obvious
TypeScript answer — `better-sqlite3`, the default in most Node projects — is a
native Node addon. There is no Node process in the bundle to load it. It cannot
work here, and this was very nearly adopted before the config was read.

Meanwhile the VPS side has no such constraint. `apps/api` is NestJS: a normal
Node process on a Hostinger KVM 2, serving licensing, the plugin/template
registry, the update feed, and opt-in metadata sync.

## Decision

**Two databases, two access layers, no shared code between them.**

**Desktop — SQLite, owned by Rust.**

- `rusqlite` with the `bundled` feature, compiled into the Tauri binary.
- The database is a file in the OS app-data directory.
- The editor reaches it only through Tauri IPC commands. The TypeScript side
  never speaks SQL.
- The IPC surface is a boundary: Zod-validated on the TS side, typed on the Rust
  side. `packages/shared` owns the schemas.

`bundled` compiles SQLite from vendored C source into the executable. There is
no system SQLite dependency, no version-matching problem, and no per-OS native
package to resolve — a contributor with the Rust toolchain that Tauri already
requires can `cargo build` on Windows, macOS, or Linux and it works.

**SaaS — PostgreSQL, accessed with Drizzle.**

- Postgres on the VPS, `apps/api` only.
- Drizzle ORM, added to the `catalog:` block.
- Licensing, registry, update feed, opt-in metadata sync. Never media.

**The two share nothing.** No common tables, no schema sync, no migrations
crossing the boundary — ADR-0002 already guarantees the VPS never touches user
media, so there is nothing to share. The desktop holds projects, timelines,
subtitle segments, media metadata, and render history. Postgres holds license
keys, plugin manifests, and release metadata.

## Consequences

**Good:**

- The download is one executable. No daemon, no install step, no configuration,
  no service. The database is a file.
- Offline-first is structural: the desktop database has no network dependency to
  lose.
- Building from source needs no native database dependency beyond the Rust
  toolchain already required by Tauri.
- The IPC seam is forced, not optional. The editor cannot reach the disk except
  through a validated boundary — which is the seam an offline-first app wants
  anyway.
- The SaaS side keeps a normal Node ORM story, unpolluted by desktop
  constraints.

**Bad, and accepted:**

- Every desktop query costs a Rust command plus an IPC round trip. Reads that
  would be a function call in-process become async. Batch at the command level;
  do not build a chatty per-row API.
- Schema changes touch two languages: the Rust migration and the Zod schema in
  `packages/shared`. They can drift, and only tests will catch it.
- Two access layers means two idioms for contributors to learn.
- Drizzle covers only half the codebase, which will read as inconsistent to
  someone who has not read this ADR.

## Alternatives rejected

- **`better-sqlite3` (or any Node SQLite driver) on the desktop** — requires a
  Node runtime that a static-exported Tauri bundle does not have. Shipping one
  to get it back means bundling Node beside the Rust shell: a second runtime, a
  larger download, and a process to supervise, all to avoid writing Rust
  commands we need regardless.
- **`drizzle-orm/sqlite-proxy` over Tauri IPC** — technically works, and buys a
  familiar query builder in TypeScript. Rejected: it puts SQL authorship on the
  webview side of the boundary, so the Rust layer degrades into a SQL pipe with
  no typed contract to validate. The IPC surface should be domain commands, not
  arbitrary statements.
- **One ORM spanning both databases** — the apparent win is a shared schema
  language, but they share no tables, so there is no schema to share. The real
  effect is dragging Node-shaped assumptions into a bundle with no Node in it.
- **Postgres on the desktop** — a server process, an install step, and a service
  to supervise, in exchange for nothing the product needs. Contradicts the
  download-and-run requirement outright.
- **SQLite on the VPS** — poor fit for concurrent web writes, and forfeits the
  one place where a real server database is actually free of constraints.
