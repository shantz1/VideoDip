# Whisper sidecar staging

Run `pnpm ai:provision:windows` from the repository root before a Windows
Tauri development or release build. The script downloads the pinned official
whisper.cpp CPU runtime, verifies its SHA-256 digest, and stages the target-
suffixed executable plus its DLLs here.

The generated files are ignored. They are build inputs, not source code. A
release build merges `tauri.release.conf.json`, which bundles the executable
as `whisper-cli.exe` beside the VideoDip application. Debug builds also detect
the target-suffixed executable directly from this folder.

For a distributable Windows build, run the provisioning command and then
`pnpm --filter @videodip/desktop tauri:build:windows`.
