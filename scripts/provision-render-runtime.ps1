# Provisions the ADR-0011 composited render runtime on a development machine:
# verifies a Node.js runtime is reachable, builds the render CLI, and lets
# Remotion download Chrome Headless Shell once, ahead of time — an export run
# itself never touches the network.
#
# Release bundles ship a pinned portable Node instead (see ADR-0011); this
# script covers the dev-machine path where `node` comes from PATH or the
# VIDEODIP_NODE override.

$ErrorActionPreference = "Stop"

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$RenderCli = Join-Path $RepositoryRoot "apps/renderer/dist/render-cli.js"

$Node = $env:VIDEODIP_NODE
if ([string]::IsNullOrWhiteSpace($Node)) {
    $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $NodeCommand) {
        throw "Node.js was not found. Install Node.js 20+ (winget install OpenJS.NodeJS.LTS) or set VIDEODIP_NODE to a node executable, then re-run."
    }
    $Node = $NodeCommand.Source
}

$NodeVersion = & $Node --version
Write-Host "Using Node $NodeVersion at $Node"

Push-Location $RepositoryRoot
try {
    pnpm --filter "@videodip/renderer" build
    if ($LASTEXITCODE -ne 0) {
        throw "Building the render CLI failed. Fix the build errors above and re-run."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $RenderCli)) {
    throw "The render CLI was not produced at $RenderCli."
}

# Remotion caches the browser under node_modules/.remotion; ensure-browser is
# idempotent and a no-op when the browser is already present.
& $Node $RenderCli ensure-browser
if ($LASTEXITCODE -ne 0) {
    throw "Chrome Headless Shell provisioning failed. Check your network connection and re-run."
}

Write-Host "Composited render runtime is provisioned. Exports can now use the Full render engine."
