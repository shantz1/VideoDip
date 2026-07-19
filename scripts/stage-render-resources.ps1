# Stages the ADR-0011 composited render runtime as Tauri release resources:
# a pruned, portable copy of @videodip/renderer (built dist/ + production
# node_modules, no dev dependencies or source) plus a pre-downloaded Chrome
# Headless Shell, so an installed VideoDip build can render composited
# exports with zero network access at export time.
#
# Output: apps/desktop/src-tauri/resources/render/ — bundled into the
# release build via tauri.release.conf.json's resources map. Regenerate this
# any time @videodip/renderer's dependencies or built output change; it is
# gitignored, like apps/desktop/src-tauri/binaries/.
#
# This is release-only. Development machines run the composited engine
# straight from the monorepo (see provision-render-runtime.ps1); this script
# additionally requires a portable Node binary (see
# provision-node-runtime.ps1) to run render-cli's `ensure-browser` inside the
# staged directory, so Remotion's cache — resolved by walking up from the
# process's cwd to the nearest package.json — lands at
# resources/render/node_modules/.remotion, exactly where the release build's
# Rust host runs render-cli.js from.

$ErrorActionPreference = "Stop"

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Destination = Join-Path $RepositoryRoot "apps/desktop/src-tauri/resources/render"
$RenderCli = Join-Path $Destination "dist/render-cli.js"

$Node = $env:VIDEODIP_NODE
if ([string]::IsNullOrWhiteSpace($Node)) {
    $BundledNode = Join-Path $RepositoryRoot "apps/desktop/src-tauri/binaries/node-x86_64-pc-windows-msvc.exe"
    if (Test-Path -LiteralPath $BundledNode) {
        $Node = $BundledNode
    }
    else {
        $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
        if ($null -eq $NodeCommand) {
            throw "No Node runtime found. Run provision-node-runtime.ps1 first, install Node.js, or set VIDEODIP_NODE."
        }
        $Node = $NodeCommand.Source
    }
}

Write-Host "Using Node at $Node"

Push-Location $RepositoryRoot
try {
    pnpm --filter "@videodip/renderer" build
    if ($LASTEXITCODE -ne 0) {
        throw "Building the render CLI failed. Fix the build errors above and re-run."
    }

    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    # `pnpm deploy` produces a portable package: built output plus a pruned
    # production-only node_modules, with workspace:* deps (@videodip/shared)
    # resolved to real files. --legacy avoids requiring
    # inject-workspace-packages=true repo-wide (pnpm 10 default) just for
    # this one release-only script. node-linker=hoisted is essential, not
    # cosmetic: pnpm's default virtual-store layout links node_modules/<pkg>
    # via an ABSOLUTE symlink into node_modules/.pnpm/... — verified by
    # inspection this resolves to this machine's dev path, which does not
    # exist once the resource bundle is installed anywhere else. Hoisted
    # linking writes real files directly, which is what a Tauri resource
    # needs to remain portable across machines.
    pnpm --filter "@videodip/renderer" deploy --prod --legacy --config.node-linker=hoisted $Destination
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm deploy failed. Fix the errors above and re-run."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $RenderCli)) {
    throw "The render CLI was not staged at $RenderCli."
}

# Run from $Destination (not the repo root) so Remotion's cwd-walk finds
# $Destination/package.json first and caches the browser at
# $Destination/node_modules/.remotion — the same directory the Rust host
# sets as the render sidecar's cwd at export time (see render.rs).
Push-Location $Destination
try {
    & $Node $RenderCli ensure-browser
    if ($LASTEXITCODE -ne 0) {
        throw "Chrome Headless Shell provisioning failed. Check your network connection and re-run."
    }
}
finally {
    Pop-Location
}

Write-Host "Render resources staged at $Destination"
