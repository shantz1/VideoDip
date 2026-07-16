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

Split the build by package kind:

**Framework-free domain packages** (`shared`, `timeline`, `subtitle-engine`, …)
bundle with tsup and emit declarations with tsc:

- **JavaScript** — `tsup` (esbuild). Fast, and TS-version-independent.
- **Declarations** — `tsc --emitDeclarationOnly`. `dts: false` in tsup configs.

So their `build` script is `tsup && tsc --emitDeclarationOnly`.

**React packages** (`ui`) build with **`tsc` alone — no bundler.**

This is not a stylistic preference. esbuild strips `'use client'` directives
during bundling, and Next's App Router depends on them: without the directive,
`ThemeProvider` is treated as a server component and throws on `useState`.
Verified empirically — the directive was absent from the tsup bundle and
present in tsc's per-file output.

The alternative, a bundle-wide `'use client'` banner, would work but is wrong:
it marks the entire package client-only, so pure helpers like `cn()` could no
longer be imported from a server component on the landing page. tsc's per-file
emit puts the directive exactly where it belongs — on `button.js` and
`theme-provider.js`, and not on `cn.js`.

Unbundled output is also better for consumers: Next tree-shakes per-module, so
a page importing one component does not pull the whole design system.

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

**Two rules that will look like cleanups to a future contributor, and are not:**

1. Do not re-enable `dts: true` in a tsup config. It fails at build time.
2. Do not add a bundler to `packages/ui`. It will strip `'use client'` and
   break the App Router at runtime — which typechecks and passes unit tests,
   so it fails late and confusingly.
