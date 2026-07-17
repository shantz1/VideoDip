# VideoDip — Repository Constitution

> This file is the long-term contract for every contributor, human or agent.
> It outranks any individual prompt. If a request conflicts with this document,
> say so and ask, rather than silently deviating.
>
> `AGENTS.md` is a pointer to this file. Keep one source of truth.

---

## 1. Product

**VideoDip is an open-source, offline-first, AI-powered desktop video editing toolkit for short-form creators.**

It is a creator platform, not a subtitle generator. Subtitles are one module among many.

### Non-goals

Non-goals are as load-bearing as goals. Do not build these without an explicit decision recorded in `docs/adr/`:

- **Not a cloud rendering service.** Transcription and rendering run on the user's machine. The VPS hosts the marketing site, auth, licensing, and the plugin/template registry — nothing compute-heavy. (See ADR-0002.)
- **Not a long-form NLE.** We are not competing with Premiere on 90-minute timelines. Optimize for clips measured in seconds and minutes.
- **Not a collaboration tool.** No real-time multiplayer, no presence, no CRDTs. Single user, single machine.
- **Not account-gated.** The editor must be fully usable with no network and no login. Anything that breaks offline use is a bug.
- **Not a mobile app.**

### Competitive stance

Submagic and VEED are cloud-first and subscription-gated. Our wedge is the inverse: your media never leaves your machine, it works on a plane, there's no per-minute quota, and it's extensible. Every feature decision should sharpen that contrast, not blur it.

---

## 2. Architecture

### Layers

```
Presentation   apps/desktop (Tauri shell), apps/web (marketing)
Application    apps/api (NestJS)
Workers        apps/worker (BullMQ), apps/renderer (Remotion)
Domain         packages/* (pure TypeScript, no I/O, no React)
Persistence    SQLite (dev + desktop), PostgreSQL (VPS)
```

### The dependency rule

**Dependencies point inward. Domain packages never import from apps.**

```
apps/*  ──────►  packages/*  ──────►  packages/shared
                     │
                     └── never imports back out
```

Concretely, and these are the rules that matter most:

- `packages/subtitle-engine` must not know that rendering exists.
- `packages/timeline` must not import React. It is a data model, not a component.
- `packages/media-engine` must not import from `apps/api`.
- AI providers must not be referenced from frontend code. Go through an interface.
- Rendering must be drivable headlessly with no UI mounted.

If you find yourself needing an inward-pointing import, you have found a design problem. Invert the dependency with an interface in `packages/shared` — do not add the import.

### Workspaces

| Path                       | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `apps/desktop`             | Tauri shell + Next.js editor UI. The product.         |
| `apps/web`                 | Marketing site + landing page. Deploys to the VPS.    |
| `apps/api`                 | NestJS. Licensing, registry, sync. Deliberately thin. |
| `apps/renderer`            | Remotion compositions. Headless-drivable.             |
| `apps/worker`              | BullMQ consumers for transcription and export.        |
| `packages/ui`              | Design system. Tokens, primitives, animations.        |
| `packages/timeline`        | Timeline data model + operations. Framework-free.     |
| `packages/subtitle-engine` | Segments, words, styling, timing. Framework-free.     |
| `packages/media-engine`    | FFmpeg orchestration, probing, thumbnails.            |
| `packages/template-engine` | Template resolution and composition.                  |
| `packages/plugin-sdk`      | Public plugin contract. Semver-stable.                |
| `packages/shared`          | Types, interfaces, Zod schemas, utils. Zero deps.     |

**`packages/shared` must have no runtime dependencies beyond `zod`.** Everything imports it; it imports nothing. Keep it that way.

### Folder conventions inside a package

Feature-based, not type-based. Group by what it does, not what it is.

```
src/
  <feature>/
    <feature>.types.ts       # interfaces, exported
    <feature>.service.ts     # logic, constructor-injected deps
    <feature>.test.ts        # colocated
    index.ts                 # public surface of the feature
  index.ts                   # public surface of the package
```

Do **not** create `utils/`, `helpers/`, or `misc/`. They are where architecture goes to die. If something is genuinely cross-cutting it belongs in `packages/shared` with a real name.

Only what's exported from a package's root `index.ts` is public. Everything else is internal and may change freely.

---

## 3. Code standards

### TypeScript

- Strict mode, repo-wide, from `tsconfig.base.json`. **Never relax a strictness flag in a package tsconfig.** Fix the code.
- `any` is banned. `unknown` plus narrowing is the answer. If you truly need an escape hatch, it needs a `// eslint-disable-next-line` with a written justification.
- No non-null assertions (`!`). Narrow properly or return a `Result`.
- Every exported symbol is documented with TSDoc. Not "what" — "why", and constraints the types can't express.
- Validate at boundaries with Zod: anything crossing IPC, HTTP, disk, or a plugin edge. Inside the domain, trust your types.

### Errors

Async operations that can fail return `Result<T, E>` from `packages/shared`, not thrown exceptions. Throwing is reserved for programmer error (invariant violations). Every error carries a recovery path — an error the user can't act on is a bug, not a message.

### Dependency injection

Constructor injection, always. No singletons, no module-level mutable state, no service locators.

```ts
// Good — testable, swappable, honest about its needs.
export class SubtitleService {
  constructor(
    private readonly transcriber: TranscriptionProvider,
    private readonly clock: Clock,
  ) {}
}

// Bad — untestable, hides its dependencies, pins us to one provider.
import { whisper } from '../ai/whisper';
export class SubtitleService {
  transcribe() {
    return whisper.run();
  }
}
```

Composition over inheritance. Class hierarchies deeper than one level need justification.

### Testing

- Vitest everywhere. Tests colocated as `*.test.ts`.
- **Every package must be testable with zero other packages running.** If a unit test needs Redis, FFmpeg, or a network, the design is wrong — inject a fake.
- Domain packages (`timeline`, `subtitle-engine`, `template-engine`) are pure and must have real coverage. They're where the bugs that matter live.
- Test behavior, not implementation. Renaming a private method should not break a test.
- Bugs get a failing test first, then the fix.

### Naming

`kebab-case` files, `PascalCase` types and components, `camelCase` values. Booleans read as assertions (`isReady`, `hasAudio`). No abbreviations except the universal ones (`id`, `url`, `ms`).

---

## 4. Design language

The bar is Linear, Arc, Raycast, Figma, VS Code. Premium, minimal, dark-first. If it looks like Bootstrap or Material, it's wrong.

### Hard rules

- **Never hardcode a color.** Not in Tailwind classes, not in CSS, not in TS. Use semantic tokens from `packages/ui`. `bg-surface-raised`, never `bg-[#1a1a1a]` or `bg-zinc-900`.
- **Never hardcode a font.** Tokens only.
- **Never hardcode spacing.** The scale exists; use it.
- **Every animation is reusable.** Motion variants live in `packages/ui/src/motion`. No inline one-off transitions.
- **Every page supports light and dark.** Dark is the default, light is not an afterthought.

Tokens are semantic, not literal. `surface-raised` describes a role; `zinc-900` describes a value. Roles survive a redesign, values don't.

### Interaction

Every async action shows progress — real progress, not a spinner, wherever a percentage is knowable. Every surface has a loading state and an empty state, designed, not defaulted. Every destructive action is undoable or confirmed. Projects autosave; "Save" should never be a thing the user has to remember.

### Accessibility

Not a phase-4 task. Keyboard navigation for every interactive element, visible focus rings, WCAG AA contrast on tokens, `prefers-reduced-motion` respected by every animation in `packages/ui`, semantic HTML and ARIA on custom controls.

**Every major action has a keyboard shortcut**, registered through the central registry — never an ad-hoc `addEventListener`. Shortcuts are discoverable via the command palette.

---

## 5. Extending the system

### Adding a module

1. `packages/<name>/` with the standard skeleton.
2. Public interface in `packages/shared` first, implementation second.
3. Register through DI. Never let a consumer `new` it directly.
4. Tests that run with no other package alive.
5. If it changes architecture, write an ADR.

### Adding a plugin

Everything user-extensible is a plugin: subtitle templates, transitions, animations, effects, fonts, AI providers, export presets.

Plugins declare a manifest, implement lifecycle hooks from `packages/plugin-sdk`, and are sandboxed — a plugin gets capabilities it declares, nothing ambient. **The SDK is a public contract under semver.** Breaking it breaks strangers' work; that means a major bump and a migration note.

A feature is "plugin-ready" when a third party could have built it using only the SDK's public exports. If core needs a private hook, the SDK is missing something — add it to the SDK rather than reaching around it.

### Adding a template

Templates are data, not code. They must be expressible as JSON validated by a Zod schema. If a template needs imperative logic, it's a plugin.

---

## 6. Performance

Targets, measured not guessed:

| Metric               | Budget       |
| -------------------- | ------------ |
| Cold start (desktop) | < 2s         |
| Idle RAM             | < 400 MB     |
| Timeline scrub       | 60 fps at 4K |
| Preview seek         | < 100 ms     |

Rules:

- CPU-heavy work goes to a worker. Never block the UI thread. Anything over ~16 ms belongs off-main.
- Optimize for 4K. GPU-accelerate where available, degrade gracefully where not.
- Virtualize any list that can exceed ~100 items.
- FFmpeg is spawned and streamed, never buffered whole. A 4K clip does not fit in memory and must never be asked to.
- Measure before optimizing. Attach a number to any performance claim in a PR.

---

## 7. Workflow

### Definition of done

A change is done when all of these are true. Not most.

- [ ] `pnpm verify` passes (typecheck, lint, test).
- [ ] New logic has tests; fixed bugs have a regression test.
- [ ] Exported symbols have TSDoc.
- [ ] Loading, empty, and error states exist for any new UI.
- [ ] Keyboard accessible; focus visible; reduced-motion respected.
- [ ] Zero hardcoded colors, fonts, or spacing.
- [ ] Works offline.
- [ ] No new inward-pointing dependency.
- [ ] ADR written if architecture moved.

### Commits and branches

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Branch off `main`; never commit to it directly. Keep PRs to one concern.

### Preferred libraries

Settled — don't relitigate without an ADR: Zustand (state), Zod (validation), Framer Motion (animation), Radix via shadcn/ui (primitives), Vitest (test), BullMQ (queue), Tauri (desktop).

Versions are pinned in the `catalog:` block of `pnpm-workspace.yaml`. Add dependencies there, reference them as `catalog:` in package manifests, and never pin a literal range in a workspace package.

Prefer the platform. Prefer zero dependencies. A dependency is a permanent liability — argue for it.

---

## 8. Agent-specific notes

- Read this file before writing code. It's the constitution.
- Build one feature at a time, completely, to the definition of done. A half-built feature is worse than an absent one.
- Placeholders are fine and expected — but a placeholder is a typed interface with a stub implementation, not a lie. Never fake a result and report it as working.
- Don't add a dependency, relax a strictness flag, or hardcode a token to make an error go away. Fix the cause.
- If the architecture resists what you're doing, that's information. Surface it instead of routing around it.
- Report honestly. If tests fail, say so. If you skipped something, say so.
