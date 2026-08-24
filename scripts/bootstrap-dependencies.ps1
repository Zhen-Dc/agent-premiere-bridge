param(
  [switch]$IncludeTranscription,
  [switch]$NoInstall
)

$ErrorActionPreference = "Stop"

function Get-CommandPath {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-NodeMajor {
  $nodePath = Get-CommandPath "node"
  if (!$nodePath) { return 0 }
  try {
    $version = (& node -v) -replace "^v", ""
    return [int]($version.Split(".")[0])
  } catch {
    return 0
  }
}

function Get-PythonVersion {
  $candidates = @(
    @{ Command = "py"; Args = @("-3", "--version") },
    @{ Command = "python"; Args = @("--version") },
    @{ Command = "python3"; Args = @("--version") }
  )

  foreach ($candidate in $candidates) {
    if (!(Get-CommandPath $candidate.Command)) { continue }
    try {
      $raw = & $candidate.Command @($candidate.Args) 2>&1
      if ($raw -match "Python\s+(\d+)\.(\d+)") {
        return [pscustomobject]@{
          Command = $candidate.Command
          Major = [int]$Matches[1]
          Minor = [int]$Matches[2]
          Text = $raw.ToString().Trim()
        }
      }
    } catch {}
  }
  return $null
}

function Invoke-WingetInstall {
  param(
    [string]$PackageId,
    [string]$DisplayName
  )

  if ($NoInstall) {
    throw "$DisplayName is required but is not installed. Re-run without -NoInstall to install it automatically."
  }

  if (!(Get-CommandPath "winget")) {
    throw "$DisplayName is required, but winget was not found. Install it manually, then rerun setup."
  }

  Write-Host "Installing $DisplayName with winget..."
  & winget install --id $PackageId --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install $DisplayName."
  }
}

Write-Host "Checking required free dependencies..."

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 20) {
  Invoke-WingetInstall -PackageId "OpenJS.NodeJS.LTS" -DisplayName "Node.js 20+"
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $nodeMajor = Get-NodeMajor
}
if ($nodeMajor -lt 20) {
  throw "Node.js 20+ is still not available on PATH after setup."
}
Write-Host "Node.js: OK"

$python = Get-PythonVersion
if (!$python -or $python.Major -lt 3 -or ($python.Major -eq 3 -and $python.Minor -lt 11)) {
  Invoke-WingetInstall -PackageId "Python.Python.3.12" -DisplayName "Python 3.11+"
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $python = Get-PythonVersion
}
if (!$python -or $python.Major -lt 3 -or ($python.Major -eq 3 -and $python.Minor -lt 11)) {
  throw "Python 3.11+ is still not available on PATH after setup."
}
Write-Host "$($python.Text): OK"

if ($IncludeTranscription) {
  Write-Host "Preparing optional local transcription dependencies..."
  $pythonCommand = if (Get-CommandPath "py") { "py" } else { $python.Command }
  $pythonArgs = if ($pythonCommand -eq "py") { @("-3") } else { @() }
  & $pythonCommand @pythonArgs -m pip install --upgrade pip faster-whisper
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install optional transcription Python packages."
  }
}

Write-Host "Dependency bootstrap complete."
