param(
  [Parameter(Mandatory = $true)]
  [string]$BaseRoot,
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot,
  [Parameter(Mandatory = $true)]
  [string]$BaseVersion,
  [Parameter(Mandatory = $true)]
  [string]$TargetVersion,
  [string]$OutputPath = (Join-Path $PSScriptRoot "REEBOT-LAB-update-v$BaseVersion-to-v$TargetVersion.zip")
)

$ErrorActionPreference = 'Stop'
$base = (Resolve-Path -LiteralPath $BaseRoot).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
$target = (Resolve-Path -LiteralPath $TargetRoot).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
$output = [IO.Path]::GetFullPath($OutputPath)
$staging = Join-Path ([IO.Path]::GetTempPath()) ("reebot-update-" + [Guid]::NewGuid().ToString('N'))
$filesRoot = Join-Path $staging 'files'
$excludedPattern = '(^|[\\/])(\.git|node_modules|\.packages|dist|\.next|outputs|work)([\\/]|$)|\.log$|(^|[\\/])REEBOT-LAB-.*\.zip$'

try {
  New-Item -ItemType Directory -Path $filesRoot -Force | Out-Null
  $baseHashes = @{}
  Get-ChildItem -LiteralPath $base -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($base.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
    if ($relative -notmatch $excludedPattern) { $baseHashes[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash }
  }

  $targetPaths = New-Object Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  $changedPaths = New-Object Collections.ArrayList
  Get-ChildItem -LiteralPath $target -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($target.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
    if ($relative -match $excludedPattern) { return }
    [void]$targetPaths.Add($relative)
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    if (-not $baseHashes.ContainsKey($relative) -or $baseHashes[$relative] -ne $hash) {
      $destination = Join-Path $filesRoot $relative
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
      [void]$changedPaths.Add($relative)
    }
  }

  $deletePaths = @($baseHashes.Keys | Where-Object { -not $targetPaths.Contains($_) } | Sort-Object)
  $manifest = [ordered]@{
    schemaVersion = 1
    baseVersion = $BaseVersion
    targetVersion = $TargetVersion
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    changedPaths = @($changedPaths | Sort-Object)
    deletePaths = $deletePaths
  }
  [IO.File]::WriteAllText((Join-Path $staging 'update.json'), ($manifest | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'apply-update.ps1') -Destination (Join-Path $staging 'apply-update.ps1') -Force
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $output -CompressionLevel Optimal
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash.ToLowerInvariant()
  Write-Output ([ordered]@{ path = $output; changed = $changedPaths.Count; deleted = $deletePaths.Count; sha256 = $hash } | ConvertTo-Json -Compress)
} finally {
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedStaging = [IO.Path]::GetFullPath($staging)
  if ($resolvedStaging.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStaging)) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}
