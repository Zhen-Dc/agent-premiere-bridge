$ErrorActionPreference = "Continue"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$configPath = Join-Path $root "bridge.config.json"
$panelPath = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.agent.premiere.bridge"
$legacyPanelPath = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.codex.premiere.bridge"

Write-Host "Agent Premiere Bridge diagnostics"
Write-Host "Root: $root"
Write-Host ""

Write-Host "Node:"
try {
  node --version
  npm --version
} catch {
  Write-Host "Node or npm was not found on PATH."
}

Write-Host ""
Write-Host "Config:"
if (Test-Path $configPath) {
  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  Write-Host "Config found: $configPath"
  Write-Host "Port: $($config.port)"
  Write-Host "Token required: $(if ($config.requireToken -eq $false) { 'no' } else { 'yes' })"
  Write-Host "Panel approval required: $(if ($config.requireApprovalInPanel -eq $false) { 'no' } else { 'yes' })"
  Write-Host "Auto-run on panel open: $(if ($config.autoRunOnPanelOpen -eq $true) { 'yes' } else { 'no' })"
  Write-Host "Approved folders:"
  if ($config.approvedFolders.Count -eq 0) {
    Write-Host "  (none)"
  } else {
    $config.approvedFolders | ForEach-Object { Write-Host "  $_" }
  }
} else {
  Write-Host "Config has not been created yet. Run npm start once."
}

Write-Host ""
Write-Host "CEP panel:"
if (Test-Path $panelPath) {
  Write-Host "Installed: $panelPath"
} else {
  Write-Host "Not installed. Run npm run install:cep"
}
Write-Host "Legacy Codex panel still installed: $(if (Test-Path $legacyPanelPath) { 'yes' } else { 'no' })"

Write-Host ""
Write-Host "CEP debug registry:"
foreach ($version in @("9", "10", "11", "12", "13", "14", "9.0", "10.0", "11.0", "12.0", "13.0", "14.0")) {
  $key = "HKCU\Software\Adobe\CSXS.$version"
  $value = (& reg.exe query $key /v PlayerDebugMode 2>$null | Select-String "PlayerDebugMode") -replace ".*REG_SZ\s+", ""
  Write-Host "CSXS.$version PlayerDebugMode: $(if ($value) { $value } else { 'not set' })"
}

Write-Host ""
Write-Host "Server health:"
if (Test-Path $configPath) {
  try {
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:$($config.port)/health" -Method Get | ConvertTo-Json -Depth 10
  } catch {
    Write-Host "Server is not reachable. Start it with npm start."
  }
}

