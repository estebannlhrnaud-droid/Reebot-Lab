param(
  [Parameter(Mandatory = $true)]
  [string]$BaseVersion,
  [Parameter(Mandatory = $true)]
  [string]$TargetVersion,
  [Parameter(Mandatory = $true)]
  [string]$PatchRoot,
  [string]$InstallBase = (Join-Path $env:ProgramFiles 'REEBOT LAB'),
  [switch]$SkipShortcuts
)

$ErrorActionPreference = 'Stop'
$baseRoot = Join-Path $installBase "app-$BaseVersion"
$targetRoot = Join-Path $installBase "app-$TargetVersion"
$patch = (Resolve-Path -LiteralPath $PatchRoot).Path
$manifestPath = Join-Path (Split-Path -Parent $patch) 'update.json'

if (-not (Test-Path -LiteralPath (Join-Path $baseRoot 'REEBOT LAB.exe'))) {
  throw "No se encontro la instalacion base $BaseVersion."
}
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'El parche no contiene update.json.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]$manifest.baseVersion -ne $BaseVersion -or [string]$manifest.targetVersion -ne $TargetVersion) {
  throw 'El parche no corresponde a estas versiones.'
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
Get-ChildItem -LiteralPath $baseRoot -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $targetRoot -Recurse -Force
}
Get-ChildItem -LiteralPath $patch -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $targetRoot -Recurse -Force
}

$targetPrefix = [IO.Path]::GetFullPath($targetRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($relativePath in @($manifest.deletePaths)) {
  if (-not $relativePath) { continue }
  $candidate = [IO.Path]::GetFullPath((Join-Path $targetRoot ([string]$relativePath)))
  if (-not $candidate.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'El manifiesto contiene una ruta insegura.' }
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { Remove-Item -LiteralPath $candidate -Force }
}

$launcher = Join-Path $targetRoot 'REEBOT LAB.exe'
$desktop = Join-Path $targetRoot 'desktop-runtime\REEBOT LAB Desktop.exe'
foreach ($required in @($launcher, $desktop, (Join-Path $targetRoot 'REEBOT LAB Updater.exe'), (Join-Path $targetRoot 'package.json'), (Join-Path $targetRoot 'telemetry-server.ps1'), (Join-Path $targetRoot 'resume-process.ps1'), (Join-Path $targetRoot 'hardware-references.json'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "La actualizacion quedo incompleta: falta $required" }
}

if (-not $SkipShortcuts) {
$shell = New-Object -ComObject WScript.Shell
$startMenuFolder = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\REEBOT LAB'
New-Item -ItemType Directory -Path $startMenuFolder -Force | Out-Null
$startShortcut = $shell.CreateShortcut((Join-Path $startMenuFolder 'REEBOT LAB.lnk'))
$startShortcut.TargetPath = $launcher
$startShortcut.WorkingDirectory = $targetRoot
$startShortcut.IconLocation = "$launcher,0"
$startShortcut.Description = 'REEBOT LAB — Tu PC, por fin entendible'
$startShortcut.Save()

$desktopFolder = [Environment]::GetFolderPath('CommonDesktopDirectory')
if ($desktopFolder) {
  $desktopShortcut = $shell.CreateShortcut((Join-Path $desktopFolder 'REEBOT LAB.lnk'))
  $desktopShortcut.TargetPath = $launcher
  $desktopShortcut.WorkingDirectory = $targetRoot
  $desktopShortcut.IconLocation = "$launcher,0"
  $desktopShortcut.Description = 'REEBOT LAB — Tu PC, por fin entendible'
  $desktopShortcut.Save()
}
}

$installInfo = @{
  version = $TargetVersion
  installedAt = (Get-Date).ToString('o')
  installRoot = $targetRoot
  previousVersion = $BaseVersion
} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $installBase 'install.json'), $installInfo, [Text.UTF8Encoding]::new($false))
Write-Output $launcher
