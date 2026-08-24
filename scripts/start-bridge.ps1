param(
  [string]$ProjectPath,
  [switch]$OpenPremiere,
  [switch]$NoPremiere
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$configPath = Join-Path $root "bridge.config.json"
$pidPath = Join-Path $root "server\data\bridge.pid"
$logPath = Join-Path $root "server\logs\bridge-launch.log"
$errorLogPath = Join-Path $root "server\logs\bridge-launch-error.log"

New-Item -ItemType Directory -Force -Path (Split-Path $pidPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null

if (!(Test-Path -LiteralPath $configPath)) {
  throw "bridge.config.json does not exist. Run Setup Bridge.bat first."
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

function Test-BridgeServer {
  param([int]$Port)
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

if (Test-BridgeServer -Port $config.port) {
  Write-Host "Premiere Bridge server is already running on port $($config.port)."
} else {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (!$node) {
    throw "Node.js was not found. Run setup after installing Node.js 20 or newer."
  }
  $process = Start-Process -FilePath $node.Source `
    -ArgumentList @("server/src/index.js") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorLogPath `
    -PassThru
  Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII
  Start-Sleep -Seconds 2
  if (!(Test-BridgeServer -Port $config.port)) {
    throw "Premiere Bridge server did not start. Check $logPath."
  }
  Write-Host "Premiere Bridge server started on port $($config.port)."
}

if (!$NoPremiere -and ($OpenPremiere -or $ProjectPath)) {
  $premierePath = $config.premiere.executablePath
  if (!$premierePath -or !(Test-Path -LiteralPath $premierePath -PathType Leaf)) {
    $detected = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "detect-premiere.ps1") | ConvertFrom-Json)
    if ($detected.found) {
      $premierePath = $detected.selected.Path
    }
  }
  if (!$premierePath -or !(Test-Path -LiteralPath $premierePath -PathType Leaf)) {
    throw "Premiere Pro could not be launched because its executable was not found."
  }
  $args = @()
  if ($ProjectPath) {
    $args += $ProjectPath
  }
  Start-Process -FilePath $premierePath -ArgumentList $args
  Write-Host "Premiere Pro launch requested."
}

Write-Host "Ready. The Agent Premiere Bridge panel will run queued jobs when it is open in Premiere."

