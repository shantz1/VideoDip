[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet(
        'help',
        'setup',
        'web',
        'desktop',
        'verify',
        'test',
        'typecheck',
        'format',
        'build',
        'package',
        'ai',
        'clean-preview',
        'clean',
        'clean-all'
    )]
    [string] $Command = 'help'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Pnpm {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)

    & pnpm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm exited with code $LASTEXITCODE."
    }
}

function Show-Help {
    Write-Host 'VideoDip root command runner'
    Write-Host ''
    Write-Host '  .\videodip.ps1 setup          Install workspace dependencies'
    Write-Host '  .\videodip.ps1 web            Run the editor UI at http://localhost:3100'
    Write-Host '  .\videodip.ps1 desktop        Run the native Tauri editor'
    Write-Host '  .\videodip.ps1 verify         Typecheck, lint, and test every workspace'
    Write-Host '  .\videodip.ps1 test           Run all tests'
    Write-Host '  .\videodip.ps1 typecheck      Typecheck all workspaces'
    Write-Host '  .\videodip.ps1 format         Format supported source and documentation'
    Write-Host '  .\videodip.ps1 build          Build all workspaces'
    Write-Host '  .\videodip.ps1 package        Build the Windows desktop installer'
    Write-Host '  .\videodip.ps1 ai             Provision the Windows Whisper runtime'
    Write-Host '  .\videodip.ps1 clean-preview  Show generated files and their total size'
    Write-Host '  .\videodip.ps1 clean          Remove generated caches/build output'
    Write-Host '  .\videodip.ps1 clean-all      Also remove installed node_modules'
}

Push-Location $PSScriptRoot
try {
    switch ($Command) {
        'help' { Show-Help }
        'setup' { Invoke-Pnpm @('install') }
        'web' { Invoke-Pnpm @('--filter', '@videodip/desktop', 'dev') }
        'desktop' { Invoke-Pnpm @('--filter', '@videodip/desktop', 'tauri', 'dev') }
        'verify' { Invoke-Pnpm @('verify') }
        'test' { Invoke-Pnpm @('test') }
        'typecheck' { Invoke-Pnpm @('typecheck') }
        'format' { Invoke-Pnpm @('format') }
        'build' { Invoke-Pnpm @('build') }
        'package' { Invoke-Pnpm @('--filter', '@videodip/desktop', 'tauri:build:windows') }
        'ai' { Invoke-Pnpm @('ai:provision:windows') }
        'clean-preview' { Invoke-Pnpm @('clean:check') }
        'clean' { Invoke-Pnpm @('clean') }
        'clean-all' { Invoke-Pnpm @('clean:all') }
    }
}
finally {
    Pop-Location
}
