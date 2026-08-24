param(
  [string[]]$ApprovedFolder,
  [string]$Port = "41326",
  [switch]$SkipNodeCheck,
  [switch]$NoCepDebug
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$configPath = Join-Path $root "bridge.config.json"
$detectScript = Join-Path $PSScriptRoot "detect-premiere.ps1"
$installScript = Join-Path $PSScriptRoot "install-cep.ps1"

function Normalize-PathForJson {
  param([string]$Value)
  return ($Value -replace "\\", "/")
}

if (!$SkipNodeCheck) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (!$node) {
    throw "Node.js was not found. Install Node.js 20 or newer, then run this setup again."
  }
  $nodeVersion = (& node -v) -replace "^v", ""
  $major = [int]($nodeVersion.Split(".")[0])
  if ($major -lt 20) {
    throw "Node.js $nodeVersion was found, but this bridge needs Node.js 20 or newer."
  }
}

$premiere = (& powershell -NoProfile -ExecutionPolicy Bypass -File $detectScript | ConvertFrom-Json)
if (!$premiere.found) {
  throw "Adobe Premiere Pro was not detected on this PC."
}

if (!$ApprovedFolder -or $ApprovedFolder.Count -eq 0) {
  $raw = Read-Host "Enter approved media/project folders separated by semicolons"
  $ApprovedFolder = $raw -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

$approved = @()
foreach ($folder in $ApprovedFolder) {
  if (!(Test-Path -LiteralPath $folder -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
  }
  $approved += Normalize-PathForJson (Resolve-Path -LiteralPath $folder)
}

$existing = $null
if (Test-Path -LiteralPath $configPath) {
  $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}

$config = [ordered]@{
  port = [int]$Port
  token = if ($existing -and $existing.token) { $existing.token } else { -join (((48..57) + (97..102)) | Get-Random -Count 48 | ForEach-Object { [char]$_ }) }
  approvedFolders = $approved
  requireApprovalInPanel = $false
  requireToken = $false
  autoRunOnPanelOpen = $true
  localhostOnly = $true
  premiere = [ordered]@{
    detectedVersion = $premiere.selected.Version
    executablePath = $premiere.selected.Path
    detectedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  createdAt = if ($existing -and $existing.createdAt) { $existing.createdAt } else { (Get-Date).ToUniversalTime().ToString("o") }
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding UTF8

if ($NoCepDebug) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $installScript -SkipDebugRegistry
} else {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $installScript -PremiereMajorVersion ([string]$premiere.selected.MajorVersion)
}

Write-Host ""
Write-Host "Premiere Bridge setup complete."
Write-Host "Detected Premiere: $($premiere.selected.Version)"
Write-Host "Premiere executable: $($premiere.selected.Path)"
Write-Host "Approved folders:"
$approved | ForEach-Object { Write-Host " - $_" }
Write-Host ""
Write-Host "Use Launch Bridge.bat or npm run launch to start the local bridge."
