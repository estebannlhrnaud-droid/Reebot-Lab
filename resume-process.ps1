param(
  [Parameter(Mandatory = $true)]
  [int]$TargetProcessId,
  [Parameter(Mandatory = $true)]
  [long]$ExpectedStartTicks,
  [ValidateRange(30, 1800)]
  [int]$DelaySeconds = 300
)

$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds $DelaySeconds

if (-not ('ReebotNative.ProcessControl' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace ReebotNative {
  public static class ProcessControl {
    [DllImport("ntdll.dll")]
    public static extern int NtResumeProcess(IntPtr processHandle);
  }
}
'@
}

$target = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
if (-not $target) { exit 0 }
$actualTicks = $target.StartTime.ToUniversalTime().Ticks
if ($actualTicks -ne $ExpectedStartTicks) { exit 0 }
[void][ReebotNative.ProcessControl]::NtResumeProcess($target.Handle)
