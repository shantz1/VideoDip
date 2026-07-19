# Sidecar staging

Two sidecars are staged here as Tauri `externalBin` inputs before a Windows
Tauri release build:

- **Whisper** — run `pnpm ai:provision:windows`. Downloads the pinned
  official whisper.cpp CPU runtime, verifies its SHA-256 digest, and stages
  the target-suffixed executable plus its DLLs here.
- **Node** (ADR-0011 render sidecar) — run `pnpm render:provision:node:windows`.
  Downloads the pinned official Node.js Windows build, verifies its SHA-256
  digest, and stages the standalone `node.exe` here. See also
  `../resources/README.md` for the render CLI + Chrome Headless Shell that
  Node runs.

The generated files are ignored. They are build inputs, not source code. A
release build merges `tauri.release.conf.json`, which bundles the executables
as `whisper-cli.exe` and `node.exe` beside the VideoDip application. Debug
builds detect whisper's target-suffixed executable directly from this folder;
`node` is expected on `PATH` in development instead (override:
`VIDEODIP_NODE`) — the staged `node.exe` here is a release-only input.

For a distributable Windows build, run both provisioning commands, then
`pnpm render:stage:release:windows`, then
`pnpm --filter @videodip/desktop tauri:build:windows`.
