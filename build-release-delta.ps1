param(
  [Parameter(Mandatory = $true)]
  [string]$BaseVersion,
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot,
  [Parameter(Mandatory = $true)]
  [string]$TargetVersion,
  [string]$OutputPath = (Join-Path $PSScriptRoot "REEBOT-LAB-update-v$BaseVersion-to-v$TargetVersion.zip")
)

$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $TargetRoot).Path
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('reebot-base-release-' + [Guid]::NewGuid().ToString('N'))
$baseZip = Join-Path $tempRoot "REEBOT-LAB-v$BaseVersion-windows.zip"
$baseExtract = Join-Path $tempRoot 'base'

try {
  New-Item -ItemType Directory -Path $baseExtract -Force | Out-Null
  $releaseUri = "https://api.github.com/repos/estebannlhrnaud-droid/Reebot-Lab/releases/tags/v$BaseVersion"
  $headers = @{ 'User-Agent' = 'REEBOT-LAB-Delta-Builder'; 'Accept' = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
  $release = Invoke-RestMethod -Uri $releaseUri -Headers $headers
  $assetName = "REEBOT-LAB-v$BaseVersion-windows.zip"
  $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
  if (-not $asset) { throw "La release v$BaseVersion no contiene $assetName." }
  Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -Headers @{ 'User-Agent' = 'REEBOT-LAB-Delta-Builder' } -OutFile $baseZip
  if ($asset.digest -and ([string]$asset.digest).StartsWith('sha256:', [StringComparison]::OrdinalIgnoreCase)) {
    $expected = ([string]$asset.digest).Substring(7)
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $baseZip).Hash
    if (-not $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'El paquete base no coincide con el digest de GitHub.' }
  }
  Expand-Archive -LiteralPath $baseZip -DestinationPath $baseExtract -Force
  $installer = Get-ChildItem -LiteralPath $baseExtract -Filter 'install-reebot.ps1' -File -Recurse | Select-Object -First 1
  if (-not $installer) { throw 'No se encontró la raíz del paquete base.' }
  $baseRoot = Split-Path -Parent $installer.FullName
  & (Join-Path $PSScriptRoot 'build-update-package.ps1') -BaseRoot $baseRoot -TargetRoot $target -BaseVersion $BaseVersion -TargetVersion $TargetVersion -OutputPath $OutputPath
} finally {
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolved = [IO.Path]::GetFullPath($tempRoot)
  if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
