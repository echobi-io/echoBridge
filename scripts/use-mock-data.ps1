[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'mock.env.example'
$target = Join-Path $repoRoot '.env'

if (-not (Test-Path $source)) {
  throw "Mock environment template not found: $source"
}

if ((Test-Path $target) -and (-not $Force)) {
  throw ".env already exists at $target. Re-run with -Force if you want to overwrite it."
}

Copy-Item -Path $source -Destination $target -Force
Write-Host "Mock mode enabled. Created $target" -ForegroundColor Green
Write-Host 'Next step: run npm start' -ForegroundColor Cyan
