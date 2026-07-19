# Render resource staging

Run `pnpm render:stage:release:windows` from the repository root before a
Windows Tauri release build. The script (`scripts/stage-render-resources.ps1`):

1. Builds `@videodip/renderer`.
2. Runs `pnpm --filter @videodip/renderer deploy --prod` into `render/` here —
   a portable, non-symlinked copy of the package: built `dist/` output plus a
   pruned production-only `node_modules` (including the platform-specific
   `@remotion/compositor-win32-x64-msvc` binary), with `workspace:*`
   dependencies (`@videodip/shared`) resolved to real files.
3. Runs `render-cli.js ensure-browser` from inside the deployed `render/`
   directory using the provisioned Node sidecar (see `../binaries/README.md`),
   so `@remotion/renderer` downloads Chrome Headless Shell into
   `render/node_modules/.remotion` — the exact directory the Rust host
   (`render.rs`) sets as the render sidecar's working directory at export
   time, since Remotion resolves that cache by walking up from `cwd` to the
   nearest `package.json`.

The generated `render/` tree is ignored — it is a release build input, not
source code, and is large (Node runtime dependencies plus a full browser).
`tauri.release.conf.json` bundles it under `resources/render/**/*` mapped to
`render/` beside the installed executable, matching where `render.rs`'s
`cli_path()` looks for `render/dist/render-cli.js`.

For a distributable Windows build with composited (not just cuts-only)
export support, run `pnpm render:provision:node:windows`, then this script,
then `pnpm ai:provision:windows`, then
`pnpm --filter @videodip/desktop tauri:build:windows`.

Re-run this script whenever `@videodip/renderer`'s dependencies or built
output change — a stale `render/` tree ships a stale render CLI.
