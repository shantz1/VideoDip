# ADR-0006: Patch TypeScript to add the sentinel file Next's build check looks for

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

ADR-0005 disabled Next's build-time type-check (`ignoreBuildErrors: true`) and
treated the resulting auto-install noise as a harmless, if annoying,
consequence: "a ~5 second tax reinstalling TypeScript... wasted, not harmful."

That assessment was wrong, discovered by direct observation. The auto-install
Next runs (`pnpm add typescript`, in an attempt to "fix" the missing package it
wrongly believes is absent) rewrites `pnpm-workspace.yaml` through pnpm's own
writer as a side effect — and that writer does not round-trip comments. Every
`next build` was silently stripping the section comments and rationale notes
from the workspace catalog (the Node-version-pinning note, the `esbuild`
`onlyBuiltDependencies` note, and so on), alphabetizing keys, and changing
quote style. This was caught and reverted three times in one session before
the pattern was recognized as systemic rather than incidental — it happens on
every build, not once.

ADR-0005's "Alternatives rejected" section considered patching and dismissed
it: "Not worth it while `next build` merely wastes 5 seconds." That premise no
longer holds — this is not a 5-second inconvenience, it is repeated, silent
loss of hand-written documentation in a file every contributor edits.

## Decision

Patch the `typescript` package via `pnpm patch` to add a stub
`lib/typescript.js` — the exact file Next's dependency check
(`has-necessary-dependencies.js`) tests for with `existsSync` before deciding
TypeScript is "missing." The stub's only job is to exist. It throws
immediately if anything ever actually `require()`s it for real work, so a
silent wrong-behavior failure mode is not traded for the silent-rewrite one.

Registered in `pnpm-workspace.yaml` as `patchedDependencies.typescript:
patches/typescript.patch`, which is committed to the repo (`patches/` is not
gitignored) so every contributor gets the same fix on `pnpm install`, not just
this machine.

Verified: after the patch, `next build` no longer prints "Installing
dependencies," TypeScript config validation dropped from ~5.5s to ~6ms, and
`pnpm-workspace.yaml` is untouched by a full clean rebuild.

This supersedes ADR-0005's "Alternatives rejected" conclusion on patching
specifically; the decision to keep `ignoreBuildErrors: true` in
`next.config.ts` stands unchanged; that is not what this ADR revisits.

## Consequences

**Good:**

- `pnpm-workspace.yaml`'s comments and structure are no longer at risk on
  every build.
- Builds are measurably faster (no pointless reinstall).
- The fix travels with the repo (`patches/typescript.patch` + the
  `patchedDependencies` entry), so every contributor gets it automatically.

**Bad, and accepted:**

- One more moving part in the dependency graph: a patch tied to `typescript`
  version `7.0.2` specifically. If a workspace `typescript` upgrade changes
  the package layout again, `pnpm patch` may need re-generating — this is
  visible immediately as a patch-application failure on `pnpm install`, not a
  silent gap.
- Anyone reading `pnpm-workspace.yaml`'s `patchedDependencies` block without
  this ADR would reasonably wonder why a language compiler needs patching at
  all; the comment in that file points here.

## Alternatives rejected

- **Do nothing, keep reverting `pnpm-workspace.yaml` after every build** — the
  status quo before this ADR. Works, but relies on every contributor noticing
  the diff before committing, forever. One missed revert ships a
  comment-stripped catalog file permanently.
- **Patch Next's compiled output instead** — rejected in ADR-0005 and still
  rejected here: pins the fix to a specific Next point release rather than to
  TypeScript's package layout, and the latter changes far less often.
- **Downgrade TypeScript below 7** — reverses ADR-0003 for a problem that now
  has a two-line fix; not proportionate.
