$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('reebot-update-test-' + [Guid]::NewGuid().ToString('N'))
$base = Join-Path $testRoot 'base'
$target = Join-Path $testRoot 'target'
$install = Join-Path $testRoot 'install'
$extract = Join-Path $testRoot 'extract'
$zip = Join-Path $testRoot 'delta.zip'

try {
  New-Item -ItemType Directory -Path (Join-Path $base 'desktop-runtime'), (Join-Path $target 'desktop-runtime'), $extract -Force | Out-Null
  foreach ($root in @($base, $target)) {
    foreach ($file in @('REEBOT LAB.exe', 'package.json', 'telemetry-server.ps1')) {
      Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $root -Force
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop-runtime\REEBOT LAB Desktop.exe') -Destination (Join-Path $root 'desktop-runtime') -Force
  }
  Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $base 'obsolete.md') -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'hardware-references.json') -Destination $target -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'resume-process.ps1') -Destination $target -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'REEBOT LAB Updater.exe') -Destination $target -Force

  & (Join-Path $projectRoot 'build-update-package.ps1') -BaseRoot $base -TargetRoot $target -BaseVersion '0.5.0' -TargetVersion '0.6.0' -OutputPath $zip | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $install 'app-0.5.0') -Force | Out-Null
  Get-ChildItem -LiteralPath $base -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $install 'app-0.5.0') -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  & (Join-Path $extract 'apply-update.ps1') -BaseVersion '0.5.0' -TargetVersion '0.6.0' -PatchRoot (Join-Path $extract 'files') -InstallBase $install -SkipShortcuts | Out-Null

  $newRoot = Join-Path $install 'app-0.6.0'
  if (-not (Test-Path -LiteralPath (Join-Path $newRoot 'hardware-references.json'))) { throw 'No se agregó el archivo nuevo.' }
  if (Test-Path -LiteralPath (Join-Path $newRoot 'obsolete.md')) { throw 'No se eliminó el archivo obsoleto.' }
  if (-not (Test-Path -LiteralPath (Join-Path $install 'app-0.5.0\obsolete.md'))) { throw 'La versión base fue modificada.' }
  Write-Output 'incremental update simulation OK'
} finally {
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolved = [IO.Path]::GetFullPath($testRoot)
  if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
