param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'REEBOT LAB.exe')
)

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'launcher\ReebotLauncher.cs'
$mascotPath = Join-Path $PSScriptRoot 'public\reebot-mascot.png'
$iconPath = Join-Path $PSScriptRoot 'launcher\reebot.ico'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'No se encontro el compilador de .NET Framework para crear el launcher.' }
if (-not (Test-Path -LiteralPath $sourcePath)) { throw "No se encontro $sourcePath" }
if (-not (Test-Path -LiteralPath $mascotPath)) { throw "No se encontro $mascotPath" }

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

& $compiler /nologo /target:winexe /optimize+ /platform:anycpu /win32icon:$iconPath /out:$OutputPath /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll $sourcePath
if ($LASTEXITCODE -ne 0) { throw "El compilador termino con codigo $LASTEXITCODE" }

$binary = Get-Item -LiteralPath $OutputPath
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash
Write-Host "Launcher creado: $($binary.FullName)"
Write-Host "Tamano: $([math]::Round($binary.Length / 1KB, 1)) KB"
Write-Host "SHA256: $hash"
