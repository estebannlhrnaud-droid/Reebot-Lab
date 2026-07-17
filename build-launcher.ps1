param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'REEBOT LAB.exe'),
  [string]$WebView2Version = '1.0.4078.44'
)

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'launcher\ReebotLauncher.cs'
$desktopSourcePath = Join-Path $PSScriptRoot 'launcher\ReebotDesktop.cs'
$updaterSourcePath = Join-Path $PSScriptRoot 'launcher\ReebotUpdater.cs'
$mascotPath = Join-Path $PSScriptRoot 'public\reebot-mascot.png'
$iconPath = Join-Path $PSScriptRoot 'launcher\reebot.ico'
$packageCache = Join-Path $PSScriptRoot '.packages'
$webViewPackageRoot = Join-Path $packageCache "Microsoft.Web.WebView2.$WebView2Version"
$webViewPackageZip = Join-Path $packageCache "Microsoft.Web.WebView2.$WebView2Version.zip"
$webViewCore = Join-Path $webViewPackageRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$webViewWinForms = Join-Path $webViewPackageRoot 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$webViewLoader = Join-Path $webViewPackageRoot 'runtimes\win-x64\native\WebView2Loader.dll'
$desktopOutputDirectory = Join-Path $PSScriptRoot 'desktop-runtime'
$desktopOutputPath = Join-Path $desktopOutputDirectory 'REEBOT LAB Desktop.exe'
$updaterOutputPath = Join-Path $PSScriptRoot 'REEBOT LAB Updater.exe'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'No se encontro el compilador de .NET Framework para crear el launcher.' }
if (-not (Test-Path -LiteralPath $sourcePath)) { throw "No se encontro $sourcePath" }
if (-not (Test-Path -LiteralPath $desktopSourcePath)) { throw "No se encontro $desktopSourcePath" }
if (-not (Test-Path -LiteralPath $updaterSourcePath)) { throw "No se encontro $updaterSourcePath" }
if (-not (Test-Path -LiteralPath $mascotPath)) { throw "No se encontro $mascotPath" }

if (-not (Test-Path -LiteralPath $webViewCore) -or -not (Test-Path -LiteralPath $webViewWinForms) -or -not (Test-Path -LiteralPath $webViewLoader)) {
  New-Item -ItemType Directory -Path $packageCache -Force | Out-Null
  if (-not (Test-Path -LiteralPath $webViewPackageZip)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $packageUrl = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WebView2Version"
    Write-Host "Descargando WebView2 SDK $WebView2Version..."
    Invoke-WebRequest -UseBasicParsing -Uri $packageUrl -OutFile $webViewPackageZip
  }
  Expand-Archive -LiteralPath $webViewPackageZip -DestinationPath $webViewPackageRoot -Force
}
if (-not (Test-Path -LiteralPath $webViewCore) -or -not (Test-Path -LiteralPath $webViewWinForms) -or -not (Test-Path -LiteralPath $webViewLoader)) {
  throw 'El paquete de WebView2 no contiene los componentes esperados para Windows x64.'
}

Add-Type -AssemblyName System.Drawing
if (-not ('ReebotIcon.NativeMethods' -as [type])) {
  Add-Type @'
namespace ReebotIcon {
  using System;
  using System.Runtime.InteropServices;
  public static class NativeMethods {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
  }
}
'@
}

$sourceImage = [Drawing.Image]::FromFile($mascotPath)
$iconBitmap = New-Object Drawing.Bitmap 256, 256
$graphics = [Drawing.Graphics]::FromImage($iconBitmap)
$graphics.Clear([Drawing.Color]::Transparent)
$graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.DrawImage($sourceImage, 0, 0, 256, 256)
$iconHandle = $iconBitmap.GetHicon()
$icon = [Drawing.Icon]::FromHandle($iconHandle)
$iconStream = [IO.File]::Open($iconPath, [IO.FileMode]::Create)
$icon.Save($iconStream)
$iconStream.Dispose()
$icon.Dispose()
[void][ReebotIcon.NativeMethods]::DestroyIcon($iconHandle)
$graphics.Dispose()
$iconBitmap.Dispose()
$sourceImage.Dispose()

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

New-Item -ItemType Directory -Path $desktopOutputDirectory -Force | Out-Null
Copy-Item -LiteralPath $webViewCore -Destination (Join-Path $desktopOutputDirectory 'Microsoft.Web.WebView2.Core.dll') -Force
Copy-Item -LiteralPath $webViewWinForms -Destination (Join-Path $desktopOutputDirectory 'Microsoft.Web.WebView2.WinForms.dll') -Force
Copy-Item -LiteralPath $webViewLoader -Destination (Join-Path $desktopOutputDirectory 'WebView2Loader.dll') -Force

& $compiler /nologo /target:winexe /optimize+ /platform:x64 /win32icon:$iconPath /out:$desktopOutputPath /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:$webViewCore /reference:$webViewWinForms $desktopSourcePath
if ($LASTEXITCODE -ne 0) { throw "El compilador del host de escritorio termino con codigo $LASTEXITCODE" }

& $compiler /nologo /target:winexe /optimize+ /platform:anycpu /win32icon:$iconPath /out:$updaterOutputPath /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll $updaterSourcePath
if ($LASTEXITCODE -ne 0) { throw "El compilador del actualizador termino con codigo $LASTEXITCODE" }

& $compiler /nologo /target:winexe /optimize+ /platform:anycpu /win32icon:$iconPath /out:$OutputPath /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll $sourcePath
if ($LASTEXITCODE -ne 0) { throw "El compilador termino con codigo $LASTEXITCODE" }

$binary = Get-Item -LiteralPath $OutputPath
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash
Write-Host "Launcher creado: $($binary.FullName)"
Write-Host "Tamano: $([math]::Round($binary.Length / 1KB, 1)) KB"
Write-Host "SHA256: $hash"
$desktopBinary = Get-Item -LiteralPath $desktopOutputPath
$desktopHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $desktopOutputPath).Hash
Write-Host "App de escritorio: $($desktopBinary.FullName)"
Write-Host "Tamano: $([math]::Round($desktopBinary.Length / 1KB, 1)) KB"
Write-Host "SHA256: $desktopHash"
$updaterBinary = Get-Item -LiteralPath $updaterOutputPath
$updaterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $updaterOutputPath).Hash
Write-Host "Actualizador: $($updaterBinary.FullName)"
Write-Host "Tamano: $([math]::Round($updaterBinary.Length / 1KB, 1)) KB"
Write-Host "SHA256: $updaterHash"
