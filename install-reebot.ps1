param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRoot,
  [string]$Version = '0.4.0',
  [string]$InstallBase = (Join-Path $env:ProgramFiles 'REEBOT LAB'),
  [switch]$SkipShortcuts
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$installRoot = Join-Path $installBase "app-$Version"

$required = @(
  (Join-Path $source 'REEBOT LAB.exe'),
  (Join-Path $source 'package.json'),
  (Join-Path $source 'telemetry-server.ps1'),
  (Join-Path $source 'desktop-runtime\REEBOT LAB Desktop.exe')
)
foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) { throw "El paquete esta incompleto: falta $path" }
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
$excluded = @('.git', 'node_modules', '.packages', 'dist', '.next', 'outputs', 'work')
Get-ChildItem -LiteralPath $source -Force | Where-Object {
  $excluded -notcontains $_.Name -and $_.Name -notlike '*.log'
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $installRoot -Recurse -Force
}

$launcher = Join-Path $installRoot 'REEBOT LAB.exe'
if (-not $SkipShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $startMenuFolder = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\REEBOT LAB'
  New-Item -ItemType Directory -Path $startMenuFolder -Force | Out-Null

  $startShortcut = $shell.CreateShortcut((Join-Path $startMenuFolder 'REEBOT LAB.lnk'))
  $startShortcut.TargetPath = $launcher
  $startShortcut.WorkingDirectory = $installRoot
  $startShortcut.IconLocation = "$launcher,0"
  $startShortcut.Description = 'REEBOT LAB — Tu PC, por fin entendible'
  $startShortcut.Save()

  $desktopFolder = [Environment]::GetFolderPath('CommonDesktopDirectory')
  if ($desktopFolder) {
    $desktopShortcut = $shell.CreateShortcut((Join-Path $desktopFolder 'REEBOT LAB.lnk'))
    $desktopShortcut.TargetPath = $launcher
    $desktopShortcut.WorkingDirectory = $installRoot
    $desktopShortcut.IconLocation = "$launcher,0"
    $desktopShortcut.Description = 'REEBOT LAB — Tu PC, por fin entendible'
    $desktopShortcut.Save()
  }
}

$installInfo = @{
  version = $Version
  installedAt = (Get-Date).ToString('o')
  installRoot = $installRoot
} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $installBase 'install.json'), $installInfo, [Text.UTF8Encoding]::new($false))

Write-Output $launcher
