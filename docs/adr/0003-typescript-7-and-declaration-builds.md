# ADR-0003: TypeScript 7, with declarations emitted by tsc

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

TypeScript 7.0.2 is the current `latest` — the native (Go) port of the compiler.
On a monorepo of this shape (12 workspaces, heavy cross-package types) the
typecheck speed difference compounts across every save, every `turbo run
typecheck`, and every CI run.

The cost is ecosystem maturity. TS 7 removed compiler internals that some tools
reach into, and we hit this immediately rather than theoretically: `tsup`'s
`dts: true` option delegates declaration bundling to `rollup-plugin-dts`, which
calls `useCaseSensitiveFileNames` on the TypeScript API. Under TS 7 that is
`undefined` and the plugin throws at module load. The JavaScript build itself
(esbuild) was unaffected and completed in ~50ms.

## Decision

Adopt TypeScript 7 repo-wide, pinned in the `catalog:` block of
`pnpm-workspace.yaml`.

Split the build in every library package:

- **JavaScript** — `tsup` (esbuild). Fast, and TS-version-independent.
- **Declarations** — `tsc --emitDeclarationOnly`. `dts: false` in tsup configs.

So a library `build` script is `tsup && tsc --emitDeclarationOnly`.

## Consequences

**Good:**

- Fast typechecking across all workspaces.
- `tsc` is the single source of truth for emitted types, which is more correct
  than a second tool re-deriving them. We would arguably want this split even
  on TS 5.
- Declarations are per-file rather than bundled, so `.d.ts.map` works and
  go-to-definition lands on our source.

**Bad, and accepted:**

- Declaration emit is slower than esbuild and is now the long pole in library
  builds.
- We are early adopters. Other tools that reach into compiler internals
  (some ESLint plugins, older codegen) may break the same way. The fallback is
  contained: pin `typescript: 5.9.x` in the catalog and nothing else changes,
  because no source code depends on TS 7 semantics.

**Rule:** do not re-enable `dts: true` in a tsup config. It will appear to be a
simplification and will fail at build time.
