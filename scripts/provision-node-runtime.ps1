param(
    [string]$Version = "v22.11.0"
)

# Provisions the ADR-0011 Node sidecar for a release bundle: downloads the
# pinned official Node.js Windows build, verifies its SHA-256 digest, and
# stages the standalone `node.exe` as a Tauri externalBin. Development
# machines use their own `node` from PATH (or VIDEODIP_NODE); this script is
# for the release build only, mirroring provision-whisper-runtime.ps1.

$ErrorActionPreference = "Stop"
$ExpectedVersion = "v22.11.0"
$ExpectedSha256 = "905373a059aecaf7f48c1ce10ffbd5334457ca00f678747f19db5ea7d256c236"

if ($Version -ne $ExpectedVersion) {
    throw "Version $Version is not approved. Update the pinned checksum in this script first."
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Destination = Join-Path $RepositoryRoot "apps/desktop/src-tauri/binaries"
$Staging = Join-Path ([System.IO.Path]::GetTempPath()) ("videodip-node-" + [guid]::NewGuid())
$Archive = Join-Path $Staging "node-win-x64.zip"
$Extracted = Join-Path $Staging "runtime"
$ArchiveName = "node-$Version-win-x64.zip"
$Uri = "https://nodejs.org/dist/$Version/$ArchiveName"

try {
    New-Item -ItemType Directory -Force -Path $Staging, $Extracted, $Destination | Out-Null
    Invoke-WebRequest -Uri $Uri -OutFile $Archive
    $ActualSha256 = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
    if ($ActualSha256 -ne $ExpectedSha256) {
        throw "Node runtime checksum mismatch. Expected $ExpectedSha256, received $ActualSha256."
    }

    Expand-Archive -LiteralPath $Archive -DestinationPath $Extracted -Force
    $Executable = Get-ChildItem -LiteralPath $Extracted -Recurse -File -Filter "node.exe" |
        Select-Object -First 1
    if ($null -eq $Executable) {
        throw "The approved archive does not contain node.exe."
    }

    # node.exe on Windows is a single self-contained binary — no DLLs or
    # adjacent files are required to run it standalone.
    Copy-Item -LiteralPath $Executable.FullName -Destination (Join-Path $Destination "node-x86_64-pc-windows-msvc.exe") -Force

    Write-Host "Provisioned Node $Version in $Destination"
}
finally {
    if (Test-Path -LiteralPath $Staging) {
        Remove-Item -LiteralPath $Staging -Recurse -Force
    }
}
