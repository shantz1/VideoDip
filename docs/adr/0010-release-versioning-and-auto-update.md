# 0010 — Release versioning and automatic client updates

- Status: accepted
- Date: 2026-07-18
- Owner request: the desktop client must download **and apply** updates itself
  when one exists (stated 2026-07-17, twice); a notification alone is not
  enough.

## Context

VideoDip has no release pipeline. TRACKER Phase 7 requires a versioning
scheme, signed automatic updates, and per-platform bundles. ADR-0002 already
names "the update feed" as one of the VPS's few legitimate jobs, and the
constitution demands offline tolerance: an unreachable feed must never degrade
the editor.

## Decision

1. **Versioning: semver, driven by git tags.** The version lives in
   `apps/desktop/src-tauri/tauri.conf.json` / `Cargo.toml` / `package.json`
   and is released by pushing a `vX.Y.Z` tag. Bumps follow Conventional
   Commits (`fix:` → patch, `feat:` → minor, breaking → major), applied
   manually until automation earns its keep.
2. **Update mechanism: `tauri-plugin-updater` with signed artifacts.**
   `createUpdaterArtifacts` is enabled; every bundle is signed with a minisign
   key. The public key is embedded in `tauri.conf.json`; the private key lives
   outside the repository (developer machine: `~/.tauri/videodip-updater.key`;
   CI: the `TAURI_SIGNING_PRIVATE_KEY` secret). Per SECURITY.md the private
   key must never enter the repo — losing it means users must reinstall
   manually, so it belongs in a password manager as well.
3. **Feed: GitHub Releases now, `apps/api` later.** The endpoint is the
   `latest.json` asset of the newest GitHub release
   (`github.com/shantz1/VideoDip`). When `apps/api` exists it can serve the
   same document at a stable URL and the endpoint list grows by one entry —
   the client contract does not change.
4. **Client flow: auto-download, user-approved restart.** After a startup
   grace period the app checks the feed once. A found update downloads
   immediately (the owner requirement), then a banner offers "Restart now" /
   "Later"; the staged update also applies on the next normal launch. The
   flow is injected through `AppUpdatePort` in `packages/shared`, so the
   reusable editor stays Tauri-free and the browser adapter is a silent no-op.
5. **Offline tolerance is part of the port contract.** A failed or
   unreachable check resolves `Ok<null>` — indistinguishable from "up to
   date" — and produces no UI.

## Consequences

- Releases become reproducible: tag → CI builds, signs, and publishes
  installers plus `latest.json` (`.github/workflows/release.yml`).
- The Windows release job must provision the Whisper sidecar binaries before
  bundling (`pnpm ai:provision:windows`), since the release config ships them.
- Update checks are the only network call the editor makes; everything else
  remains fully offline.
- Key rotation requires a new release signed with both keys' trust chain —
  i.e., don't lose the key.
