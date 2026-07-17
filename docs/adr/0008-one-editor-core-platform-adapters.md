# ADR-0008: One shared editor core with thin platform adapters

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

VideoDip targets a Tauri desktop application and, later, a browser-hosted
editor. The current editor React tree and Zustand stores live under
`apps/desktop`, while `apps/web` is empty. If features continue to accumulate
there, a browser editor would either duplicate the product or import code from
another app. Both outcomes violate the dependency rule and make behavior drift
between platforms likely.

Most product behavior is platform-neutral. Timeline editing, selection,
commands, preview composition, validation, and most UI do not care whether the
host is Tauri or a browser. Filesystem access, persistence, native processes,
and update installation do care. Pretending those capabilities are identical
would replace duplication with scattered runtime checks.

## Decision

**VideoDip has one reusable editor implementation and thin platform hosts.**

- Reusable editor state, controllers, React feature UI, and command handling
  move into a shared editor workspace as package reviews reach them.
- `apps/desktop` becomes a composition root that supplies Tauri adapters for
  dialogs, SQLite, native FFmpeg/sidecars, asset URLs, and updates.
- The browser host supplies browser adapters for file access, OPFS/IndexedDB,
  local workers/WebCodecs where capable, and browser downloads.
- Platform capabilities are injected through narrow ports. Reusable editor
  code never imports Tauri, probes platform globals, or branches on
  `isTauri()`.
- Domain packages remain framework-free. The shared editor workspace may use
  React because it is presentation/application code, not a domain package.
- Unsupported capabilities are explicit data. The same UI can disable or
  explain an unavailable operation without forking the feature.

This shares product behavior, not operating-system implementations. Native
process spawning and browser media APIs remain separate adapters behind the
same contracts.

## Performance constraints

- Heavy media work stays outside the UI thread in native processes or workers.
- Editor subscriptions select the narrowest state required to avoid broad
  React rerenders.
- Timeline rows and clips are virtualized once measured project sizes cross
  the constitution's list threshold.
- Optimizations require benchmarks against the 4K scrub, seek, cold-start, and
  memory budgets; no platform fork is justified by an unmeasured assumption.

## Migration

Migration follows the owner-approved review order: timeline, shared, media
engine, renderer, desktop editor, then plugin SDK. Each package is left
verified before the next extraction begins. There is no big-bang directory
move and no duplicate browser implementation in the interim.

## Consequences

**Good:** one behavior and test suite for both hosts; platform code is small
and replaceable; browser work cannot silently diverge from desktop editing.

**Accepted cost:** capability ports and composition roots add indirection, and
some platform adapters necessarily have different performance envelopes.

**Still out of scope:** this ADR does not authorize cloud rendering, account
gating, or server-side media processing. Phase 6 still needs its separate scope
ADR before those constitution non-goals change.
