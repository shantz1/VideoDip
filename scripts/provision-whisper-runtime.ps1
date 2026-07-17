param(
    [string]$Version = "v1.8.6"
)

$ErrorActionPreference = "Stop"
$ExpectedVersion = "v1.8.6"
$ExpectedSha256 = "b07ea0b1b4115a38e1a7b07debf581f0b77d999925f8acb8f39d322b0ba0a822"

if ($Version -ne $ExpectedVersion) {
    throw "Version $Version is not approved. Update the pinned checksum in this script first."
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Destination = Join-Path $RepositoryRoot "apps/desktop/src-tauri/binaries"
$Staging = Join-Path ([System.IO.Path]::GetTempPath()) ("videodip-whisper-" + [guid]::NewGuid())
$Archive = Join-Path $Staging "whisper-bin-x64.zip"
$Extracted = Join-Path $Staging "runtime"
$Uri = "https://github.com/ggml-org/whisper.cpp/releases/download/$Version/whisper-bin-x64.zip"

try {
    New-Item -ItemType Directory -Force -Path $Staging, $Extracted, $Destination | Out-Null
    Invoke-WebRequest -Uri $Uri -OutFile $Archive
    $ActualSha256 = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
    if ($ActualSha256 -ne $ExpectedSha256) {
        throw "Whisper runtime checksum mismatch. Expected $ExpectedSha256, received $ActualSha256."
    }

    Expand-Archive -LiteralPath $Archive -DestinationPath $Extracted -Force
    $Executable = Get-ChildItem -LiteralPath $Extracted -Recurse -File -Filter "whisper-cli.exe" |
        Select-Object -First 1
    if ($null -eq $Executable) {
        throw "The approved archive does not contain whisper-cli.exe."
    }

    Copy-Item -LiteralPath $Executable.FullName -Destination (Join-Path $Destination "whisper-cli-x86_64-pc-windows-msvc.exe") -Force
    Get-ChildItem -LiteralPath $Executable.DirectoryName -File -Filter "*.dll" |
        ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $Destination -Force }

    Write-Host "Provisioned whisper.cpp $Version in $Destination"
}
finally {
    if (Test-Path -LiteralPath $Staging) {
        Remove-Item -LiteralPath $Staging -Recurse -Force
    }
}
