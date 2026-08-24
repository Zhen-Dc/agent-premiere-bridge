$ErrorActionPreference = "Stop"

function Convert-VersionNumber {
  param([string]$Value)
  if ($Value -match '(\d+(?:\.\d+)?)') {
    $number = [double]$Matches[1]
    if ($number -ge 2000) {
      return $number - 2000
    }
    return $number
  }
  return 0
}

function Add-PremiereCandidate {
  param(
    [System.Collections.Generic.List[object]]$Candidates,
    [string]$Path,
    [string]$Version,
    [string]$Source
  )
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $resolvedPath = ($Path -replace '",.*$', '"') -replace ',.*$', ''
  $resolvedPath = $resolvedPath.Trim('"')
  if ((Test-Path -LiteralPath $Path -PathType Container)) {
    $exe = Join-Path $Path "Adobe Premiere Pro.exe"
    if (Test-Path -LiteralPath $exe -PathType Leaf) {
      $resolvedPath = $exe
    }
  }
  if (!(Test-Path -LiteralPath $resolvedPath -PathType Leaf)) { return }
  if ((Split-Path $resolvedPath -Leaf) -ne "Adobe Premiere Pro.exe") { return }
  if ($Candidates | Where-Object { $_.Path -eq $resolvedPath }) { return }
  $Candidates.Add([pscustomobject]@{
    Name = "Adobe Premiere Pro"
    Version = $Version
    MajorVersion = Convert-VersionNumber $Version
    Path = $resolvedPath
    Source = $Source
  }) | Out-Null
}

$candidates = [System.Collections.Generic.List[object]]::new()

$uninstallRoots = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
)

foreach ($root in $uninstallRoots) {
  if (!(Test-Path $root)) { continue }
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $item = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($item.DisplayName -notmatch "Adobe Premiere Pro") { return }
    Add-PremiereCandidate $candidates $item.DisplayIcon $item.DisplayVersion "registry"
    Add-PremiereCandidate $candidates $item.InstallLocation $item.DisplayVersion "registry"
  }
}

$programRoots = @(
  ${env:ProgramFiles},
  ${env:ProgramFiles(x86)}
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($programRoot in $programRoots) {
  $adobeRoot = Join-Path $programRoot "Adobe"
  if (!(Test-Path -LiteralPath $adobeRoot)) { continue }
  Get-ChildItem -LiteralPath $adobeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "Adobe Premiere Pro*" } |
    ForEach-Object {
      $version = ($_.Name -replace "^Adobe Premiere Pro\s*", "").Trim()
      Add-PremiereCandidate $candidates $_.FullName $version "program-files"
    }
}

$result = $candidates |
  Sort-Object @{ Expression = "MajorVersion"; Descending = $true }, Path |
  Select-Object -First 1

if (!$result) {
  Write-Output (@{ found = $false; candidates = @() } | ConvertTo-Json -Depth 5)
  exit 0
}

Write-Output (@{
  found = $true
  selected = $result
  candidates = @($candidates | Sort-Object @{ Expression = "MajorVersion"; Descending = $true }, Path)
} | ConvertTo-Json -Depth 5)
