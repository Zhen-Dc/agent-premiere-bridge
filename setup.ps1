param(
  [string[]]$ApprovedFolder,
  [string]$Port = "41326",
  [switch]$IncludeTranscription,
  [switch]$NoInstall,
  [switch]$NoCepDebug
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path $PSScriptRoot
$bootstrapScript = Join-Path $root "scripts\bootstrap-dependencies.ps1"
$setupBridgeScript = Join-Path $root "scripts\setup-bridge.ps1"

Write-Host "Agent Premiere Bridge setup"
Write-Host "Root: $root"
Write-Host ""

$bootstrapArgs = @()
if ($IncludeTranscription) {
  $bootstrapArgs += "-IncludeTranscription"
}
if ($NoInstall) {
  $bootstrapArgs += "-NoInstall"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $bootstrapScript @bootstrapArgs
if ($LASTEXITCODE -ne 0) {
  throw "Dependency bootstrap failed."
}

$setupArgs = @(
  "-Port", $Port
)

foreach ($folder in @($ApprovedFolder)) {
  if ($folder) {
    $setupArgs += @("-ApprovedFolder", $folder)
  }
}

if ($NoCepDebug) {
  $setupArgs += "-NoCepDebug"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $setupBridgeScript @setupArgs
if ($LASTEXITCODE -ne 0) {
  throw "Premiere bridge setup failed."
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Run .\Launch Bridge.bat, or have your agent run npm run launch."
