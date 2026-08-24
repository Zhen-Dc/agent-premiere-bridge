param(
  [string]$PremiereMajorVersion,
  [switch]$SkipDebugRegistry
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $root "cep-panel"
$extensionsRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$target = Join-Path $extensionsRoot "com.codex.premiere.bridge"

if (!(Test-Path $source)) {
  throw "CEP panel folder not found: $source"
}

New-Item -ItemType Directory -Force -Path $extensionsRoot | Out-Null
if (Test-Path $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
Copy-Item -LiteralPath $source -Destination $target -Recurse

if (!$SkipDebugRegistry) {
  $cepVersions = @()
  if ($PremiereMajorVersion) {
    $major = [int][double]$PremiereMajorVersion
    $cepMajor = [Math]::Max(9, [Math]::Min(14, $major - 12))
    $cepVersions = @([string]$cepMajor, "$cepMajor.0")
  } else {
    $cepVersions = @("9", "9.0")
  }

  foreach ($version in $cepVersions | Select-Object -Unique) {
    $key = "HKCU\Software\Adobe\CSXS.$version"
    & reg.exe add $key /v PlayerDebugMode /t REG_SZ /d 1 /f | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to set CEP debug registry value for CSXS.$version"
    }
  }
}

Write-Host "Installed Codex Premiere Bridge panel to:"
Write-Host $target
Write-Host ""
Write-Host "Restart Premiere Pro, then open Window > Extensions > Codex Premiere Bridge once and save that workspace."
