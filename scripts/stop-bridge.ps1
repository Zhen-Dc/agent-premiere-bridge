$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pidPath = Join-Path $root "server\data\bridge.pid"

if (!(Test-Path -LiteralPath $pidPath)) {
  Write-Host "No bridge PID file was found."
  exit 0
}

$pidValue = Get-Content -LiteralPath $pidPath -Raw
$pidValue = $pidValue.Trim()
if (!$pidValue) {
  Remove-Item -LiteralPath $pidPath -Force
  Write-Host "Bridge PID file was empty and has been removed."
  exit 0
}

$process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $process.Id -Force
  Write-Host "Stopped Premiere Bridge server process $pidValue."
} else {
  Write-Host "Bridge process $pidValue is not running."
}

Remove-Item -LiteralPath $pidPath -Force
