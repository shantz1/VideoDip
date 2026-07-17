# ADR-0005: Disable Next's build-time TypeScript check; `turbo typecheck` is the sole gate

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

ADR-0003 adopted TypeScript 7 repo-wide for typecheck speed. `next build` in
`apps/desktop` crashed outright under it:

```
The "id" argument must be of type string. Received undefined
Next.js build worker exited with code: 1 and signal: null
```

Traced to root cause in `next/dist/esm/lib/has-necessary-dependencies.js` and
`verify-typescript-setup.js` (Next 16.2.10):

1. Next confirms TypeScript is usable by checking that
   `typescript/lib/typescript.js` exists inside the resolved package. TypeScript
   7's native (Go-ported) release restructured its package entirely — it ships
   `lib/tsc.js`, `lib/version.cjs`, and a `dist/api/*` surface behind an
   `exports` map, but not `lib/typescript.js`. The sentinel file check fails.
2. Next concludes TypeScript is "missing" and auto-installs it. The reinstalled
   package is the same TS 7, with the same layout, so the sentinel check fails
   again. This step is pure waste — a `pnpm add` that changes nothing — but it
   is not the crash.
3. Next's dependency resolver only records a resolution for the `typescript`
   key when the sentinel-file check _succeeds_. It never does here, so when the
   build later runs `require(deps.resolved.get('typescript'))` to load the
   compiler for its internal type-check pass, `get('typescript')` returns
   `undefined` and `require(undefined)` throws exactly the error above.

This is an upstream incompatibility between Next 16.2.10's TypeScript-detection
code and TypeScript 7's package layout. It is not fixable from repo
configuration, workspace linking, or `pnpm` settings — the sentinel path is
hardcoded in Next's compiled source.

Two facts make the fix straightforward rather than a reason to reconsider
ADR-0003. First, `turbo.json` already runs `typecheck` (`tsc --noEmit`,
package-managed, real TypeScript 7) as its own task, gating `pnpm verify`
independently of any Next build step. Second, `build` and `typecheck` are
sibling tasks in the turbo graph — neither depends on the other — so nothing
before this change actually required Next's internal check to run; it was
always redundant with the pipeline's own type-checking pass, and the crash
only surfaced when a real desktop build was attempted for the first time.

## Decision

Set `typescript.ignoreBuildErrors: true` in `apps/desktop/next.config.ts`.

This turns off only Next's internal, duplicate type-check during `next build`.
It does not turn off type-checking: `turbo run typecheck` still runs the real
compiler across the whole graph and is part of `pnpm verify`, which the
Definition of Done in `CLAUDE.md` requires to pass. A type error still fails
the pipeline — it fails at the `typecheck` task instead of inside `next build`.

Do not "fix" this by re-flipping the flag to `false`; the crash returns because
the sentinel-file lookup is unconditional and cannot be worked around from
`next.config.ts`.

## Consequences

**Good:**

- The desktop build completes instead of crashing.
- No duplicate type-checking work: `tsc --noEmit` runs once, in `turbo
typecheck`, instead of once there and once (uselessly) again inside `next
build`.
- ADR-0003's TypeScript 7 adoption stands as originally decided; this ADR adds
  a consequence, it does not supersede it.

**Bad, and accepted:**

- Every `next build` still pays a ~5 second tax reinstalling TypeScript that
  Next's dependency check wrongly believes is missing. This is wasted, not
  harmful — the reinstalled package is identical — but it will look alarming
  in build logs to anyone who hasn't read this ADR.
- If a future Next release changes its sentinel path or TypeScript restores a
  compatible legacy export, this decision should be revisited — the
  auto-install noise is worth removing if the underlying check becomes benign.
- Anyone reading `apps/desktop/next.config.ts` without this ADR would
  reasonably assume `ignoreBuildErrors: true` means "we stopped caring about
  type safety." It means the opposite: type safety moved to a single canonical
  gate instead of being duplicated (and now broken) in two places.

## Alternatives rejected

- **Downgrade TypeScript below 7 for `apps/desktop` only** — the `catalog:`
  block pins one TypeScript version repo-wide by design (`CLAUDE.md` §7); a
  per-package override would violate that and reintroduce exactly the kind of
  drift the catalog exists to prevent, for a problem that doesn't require it.
- **Downgrade TypeScript repo-wide, reversing ADR-0003** — throws away the
  typecheck-speed win that motivated TS 7 in the first place, for a build-log
  cosmetic issue that has a one-line fix.
- **Patch Next's compiled output directly** (e.g. via `pnpm patch`) — fixes the
  auto-install noise too, but pins us to patching a specific Next point release
  and re-verifying the patch on every upgrade. Not worth it while `next build`
  merely wastes 5 seconds rather than failing.
