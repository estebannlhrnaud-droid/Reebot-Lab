param(
  [string]$Version = '0.6.0',
  [string]$OutputPath = (Join-Path $PSScriptRoot "REEBOT-LAB-v$Version-windows.zip")
)

$ErrorActionPreference = 'Stop'
$output = [IO.Path]::GetFullPath($OutputPath)
$staging = Join-Path ([IO.Path]::GetTempPath()) ("reebot-release-" + [Guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $staging ("REEBOT LAB $Version")
$required = @(
  'REEBOT LAB.exe',
  'REEBOT LAB Updater.exe',
  'desktop-runtime\REEBOT LAB Desktop.exe',
  'telemetry-server.ps1',
  'resume-process.ps1',
  'hardware-references.json',
  'install-reebot.ps1',
  'package.json'
)
foreach ($relative in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $relative))) { throw "Falta el componente requerido: $relative" }
}

try {
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  $excluded = @('.git', 'node_modules', '.packages', 'dist', '.next', 'outputs', 'work')
  Get-ChildItem -LiteralPath $PSScriptRoot -Force | Where-Object {
    $excluded -notcontains $_.Name -and
    $_.Name -notlike '*.log' -and
    $_.Name -notlike '.reebot-*' -and
    $_.Name -notlike 'REEBOT-LAB-*-windows.zip' -and
    $_.Name -notlike 'REEBOT-LAB-update-*.zip'
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $packageRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  Compress-Archive -Path $packageRoot -DestinationPath $output -CompressionLevel Optimal
  $file = Get-Item -LiteralPath $output
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash.ToLowerInvariant()
  Write-Output ([ordered]@{ path = $file.FullName; sizeMB = [math]::Round($file.Length / 1MB, 2); sha256 = $hash } | ConvertTo-Json -Compress)
} finally {
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedStaging = [IO.Path]::GetFullPath($staging)
  if ($resolvedStaging.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStaging)) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}
