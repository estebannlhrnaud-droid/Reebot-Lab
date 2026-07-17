param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'SilentlyContinue'

$bridgeVersion = '0.6.0'
$bridgeStatePath = Join-Path $PSScriptRoot '.reebot-bridge.json'
$actionAuditPath = Join-Path $PSScriptRoot '.reebot-actions.jsonl'
$preferredModel = if ($env:REEBOT_AI_MODEL) { $env:REEBOT_AI_MODEL } else { 'qwen3.5:9b' }
$allowedHostedOrigins = @(
  'https://reebot-lab-preview.estebannlhrnaud.chatgpt.site'
)
$protectedProcessNames = @(
  'idle', 'system', 'registry', 'memory compression', 'secure system',
  'smss', 'csrss', 'wininit', 'services', 'lsass', 'svchost', 'winlogon',
  'dwm', 'explorer', 'sihost', 'fontdrvhost', 'wudfhost', 'audiodg',
  'spoolsv', 'msmpeng', 'nissrv', 'securityhealthservice', 'taskhostw',
  'conhost', 'powershell', 'pwsh', 'cmd', 'node', 'ollama',
  'reebot lab', 'reebot lab desktop', 'nvidia container'
)
$backgroundProcessPattern = '(?i)(steamwebhelper|epicwebhelper|discord|teams|msedge|chrome|firefox|creative cloud|adobe|onedrive|wallpaper|widgets|spotify|battle\.net|riotclient)'
$script:agentSessionId = (Get-Process -Id $PID).SessionId
$script:logicalProcessors = [math]::Max(1, [Environment]::ProcessorCount)
$script:previousProcessCpu = @{}
$script:lastProcessSample = [DateTime]::UtcNow
$script:actionPlans = @{}
$script:undoActions = @{}
$script:pausedProcesses = @{}
$hardwareCatalogPath = Join-Path $PSScriptRoot 'hardware-references.json'

if (-not ('ReebotNative.ProcessControl' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace ReebotNative {
  public static class ProcessControl {
    [DllImport("ntdll.dll")]
    public static extern int NtSuspendProcess(IntPtr processHandle);
    [DllImport("ntdll.dll")]
    public static extern int NtResumeProcess(IntPtr processHandle);
  }
}
'@
}

function New-SecureToken {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-PairCode {
  $bytes = New-Object byte[] 4
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $value = ([BitConverter]::ToUInt32($bytes, 0) % 900000) + 100000
  return $value.ToString('000000')
}

function Save-BridgeState {
  @{ token = $script:bridgeToken } | ConvertTo-Json -Compress | Set-Content -LiteralPath $bridgeStatePath -Encoding UTF8
}

$bridgeToken = $null
if (Test-Path -LiteralPath $bridgeStatePath) {
  $savedState = Get-Content -Raw -LiteralPath $bridgeStatePath | ConvertFrom-Json
  if ($savedState.token) { $bridgeToken = [string]$savedState.token }
}
if (-not $bridgeToken) {
  $bridgeToken = New-SecureToken
  Save-BridgeState
}

$pairCode = New-PairCode
$pairAttempts = 0
$pairLockedUntil = [DateTime]::MinValue

function Test-IsLocalOrigin([string]$origin) {
  return $origin -match '^http://(localhost|127\.0\.0\.1)(:\d+)?$'
}

function Test-IsLocalAppOrigin([string]$origin) {
  return $origin -match '^http://(localhost|127\.0\.0\.1):3000$'
}

function Test-IsAllowedOrigin([string]$origin) {
  if (-not $origin) { return $false }
  if (Test-IsLocalOrigin $origin) { return $true }
  return $allowedHostedOrigins -contains $origin
}

function Set-CorsHeaders($ctx) {
  $origin = [string]$ctx.Request.Headers['Origin']
  if ($origin -and (Test-IsAllowedOrigin $origin)) {
    $ctx.Response.Headers['Access-Control-Allow-Origin'] = $origin
    $ctx.Response.Headers['Vary'] = 'Origin'
    $ctx.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $ctx.Response.Headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Reebot-Pair-Code'
    $ctx.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
    $ctx.Response.Headers['Access-Control-Max-Age'] = '600'
  }
}

function Write-JsonResponse($ctx, [int]$statusCode, $payload) {
  $json = $payload | ConvertTo-Json -Depth 12 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $statusCode
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Read-JsonBody($ctx) {
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
  $raw = $reader.ReadToEnd()
  $reader.Dispose()
  if (-not $raw) { return @{} }
  return $raw | ConvertFrom-Json
}

function Test-IsAuthorized($ctx) {
  $origin = [string]$ctx.Request.Headers['Origin']
  if (Test-IsLocalOrigin $origin) { return $true }
  $authorization = [string]$ctx.Request.Headers['Authorization']
  return $authorization -eq "Bearer $script:bridgeToken"
}

function Get-AiStatus {
  try {
    $payload = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 3
    $models = @($payload.models | ForEach-Object { if ($_.name) { [string]$_.name } elseif ($_.model) { [string]$_.model } })
    $model = $null
    if ($models -contains $preferredModel) {
      $model = $preferredModel
    } else {
      $model = $models | Where-Object { $_ -and $_ -notmatch 'embed' } | Select-Object -First 1
    }
    if ($model) {
      return [ordered]@{ engine = 'ollama'; available = $true; model = $model; models = $models; reason = 'La IA local está lista en tu PC.' }
    }
    return [ordered]@{ engine = 'basic'; available = $false; model = $null; models = $models; reason = 'Ollama está activo, pero no tiene un modelo de conversación.' }
  } catch {
    return [ordered]@{ engine = 'basic'; available = $false; model = $null; models = @(); reason = 'Ollama no está activo en esta PC.' }
  }
}

function Get-ProcessSafety($process) {
  $name = [string]$process.ProcessName
  $normalizedName = $name.ToLowerInvariant()
  $path = $null
  $company = $null
  $sessionId = -1
  try { $sessionId = [int]$process.SessionId } catch {}
  try { $path = [string]$process.Path } catch {}
  if ($path) {
    try { $company = [string](Get-Item -LiteralPath $path).VersionInfo.CompanyName } catch {}
  }

  $blockedReason = $null
  if ([int]$process.Id -le 4) { $blockedReason = 'Es un proceso esencial de Windows.' }
  elseif ([int]$process.Id -eq $PID) { $blockedReason = 'Es el agente local de REEBOT.' }
  elseif ($protectedProcessNames -contains $normalizedName) { $blockedReason = 'REEBOT lo protege porque participa en Windows, controladores o la propia app.' }
  elseif ($sessionId -ne $script:agentSessionId) { $blockedReason = 'Pertenece a otra sesión o al sistema.' }
  elseif ($path -and $path.StartsWith($env:WINDIR, [StringComparison]::OrdinalIgnoreCase)) { $blockedReason = 'Se ejecuta desde la carpeta de Windows.' }

  return [ordered]@{
    allowed = -not [bool]$blockedReason
    reason = if ($blockedReason) { $blockedReason } else { 'Puede recibir una optimización reversible con confirmación.' }
    path = $path
    company = $company
    sessionId = $sessionId
  }
}

function Remove-ExpiredActionState {
  $now = [DateTime]::UtcNow
  foreach ($key in @($script:actionPlans.Keys)) {
    if ($script:actionPlans[$key].expiresAt -lt $now) { $script:actionPlans.Remove($key) }
  }
  foreach ($key in @($script:undoActions.Keys)) {
    if ($script:undoActions[$key].expiresAt -lt $now) { $script:undoActions.Remove($key) }
  }
}

function Write-ActionAudit($entry) {
  $record = [ordered]@{ timestamp = [DateTime]::UtcNow.ToString('o'); version = $bridgeVersion }
  foreach ($key in $entry.Keys) { $record[$key] = $entry[$key] }
  $record | ConvertTo-Json -Compress | Add-Content -LiteralPath $actionAuditPath -Encoding UTF8
}

function Convert-ToNumber($value, [double]$fallback = 0) {
  if ($null -eq $value) { return $fallback }
  $parsed = 0.0
  $text = ([string]$value).Trim().Replace(',', '.')
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) { return $parsed }
  return $fallback
}

function Find-HardwareReference($items, [string]$deviceName) {
  foreach ($entry in @($items)) {
    if ($entry.match -and $deviceName.IndexOf([string]$entry.match, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $entry }
  }
  return $null
}

function Get-ClockState([double]$current, [double]$base, [double]$boost) {
  if ($current -le 0 -or $base -le 0) { return 'unknown' }
  if ($boost -gt 0 -and $current -gt $boost) { return 'xoc_possible' }
  if ($current -gt ($base * 1.01)) { return 'boost' }
  return 'base'
}

function Get-ManualGpuOcProfile {
  $nvidiaLog = Join-Path $env:LOCALAPPDATA 'NVIDIA Corporation\NVIDIA App\CxNative_NVIDIA App.log'
  if (Test-Path -LiteralPath $nvidiaLog) {
    $nvidiaRaw = Get-Content -LiteralPath $nvidiaLog -Raw
    $coreMatches = [regex]::Matches($nvidiaRaw, 'averageGpuClockOffsetMhz\s*:\s*(-?\d+)')
    $memoryMatches = [regex]::Matches($nvidiaRaw, 'memoryOcOffsetMhz\s*:\s*(-?\d+)')
    if ($coreMatches.Count -gt 0 -or $memoryMatches.Count -gt 0) {
      $nvidiaCore = if ($coreMatches.Count -gt 0) { [double]$coreMatches[$coreMatches.Count - 1].Groups[1].Value } else { 0 }
      $nvidiaMemory = if ($memoryMatches.Count -gt 0) { [double]$memoryMatches[$memoryMatches.Count - 1].Groups[1].Value } else { 0 }
      if ($nvidiaCore -ne 0 -or $nvidiaMemory -ne 0) {
        return [ordered]@{
          detected = $true
          coreOffset = $nvidiaCore
          memoryOffset = $nvidiaMemory
          source = 'NVIDIA App / Afinamiento automático'
        }
      }
    }
  }
  $roots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'MSI Afterburner\Profiles'),
    (Join-Path $env:ProgramFiles 'MSI Afterburner\Profiles')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  foreach ($root in $roots) {
    $profile = Get-ChildItem -LiteralPath $root -Filter 'VEN_10DE*.cfg' -File | Select-Object -First 1
    if (-not $profile) { continue }
    $raw = Get-Content -LiteralPath $profile.FullName -Raw
    $startup = [regex]::Match($raw, '(?ms)^\[Startup\]\s*(.*?)(?=^\[|\z)').Groups[1].Value
    if (-not $startup) { continue }
    $coreMatch = [regex]::Match($startup, '(?m)^CoreClkBoost\s*=\s*(-?\d+)\s*$')
    $memoryMatch = [regex]::Match($startup, '(?m)^MemClkBoost\s*=\s*(-?\d+)\s*$')
    $coreOffset = if ($coreMatch.Success) { [math]::Round(([double]$coreMatch.Groups[1].Value) / 1000, 0) } else { 0 }
    $memoryOffset = if ($memoryMatch.Success) { [math]::Round(([double]$memoryMatch.Groups[1].Value) / 1000, 0) } else { 0 }
    return [ordered]@{
      detected = ($coreOffset -ne 0 -or $memoryOffset -ne 0)
      coreOffset = $coreOffset
      memoryOffset = $memoryOffset
      source = 'MSI Afterburner / Startup'
    }
  }
  return [ordered]@{ detected = $false; coreOffset = 0; memoryOffset = 0; source = $null }
}

$disk = Get-Disk -Number 1
$partition = Get-Partition -DiskNumber 1 | Where-Object DriveLetter | Select-Object -First 1
$diskLabel = "Disco 1 - $($disk.FriendlyName) ($($partition.DriveLetter):)"
$osStatic = Get-CimInstance Win32_OperatingSystem
$totalMemoryBytes = [double]$osStatic.TotalVisibleMemorySize * 1KB
$volumeStatic = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($partition.DriveLetter):'"
$cpuStatic = Get-CimInstance Win32_Processor | Select-Object -First 1
$cpuName = if ($cpuStatic.Name) { ([string]$cpuStatic.Name).Trim() } else { 'Procesador no identificado' }
$hardwareCatalog = if (Test-Path -LiteralPath $hardwareCatalogPath) { Get-Content -LiteralPath $hardwareCatalogPath -Raw | ConvertFrom-Json } else { $null }
$cpuReference = Find-HardwareReference $hardwareCatalog.cpus $cpuName
$cpuBaseClock = if ($cpuReference.baseMHz) { [double]$cpuReference.baseMHz } else { [double]$cpuStatic.MaxClockSpeed }
$cpuBoostClock = if ($cpuReference.boostMHz) { [double]$cpuReference.boostMHz } else { 0 }
$manualGpuOc = Get-ManualGpuOcProfile

function Get-MetricsSnapshot {
  $cpuPerf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
  if (-not $cpuPerf) { $cpuPerf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" }
  $cpu = Convert-ToNumber $cpuPerf.PercentProcessorTime
  $cpuReportedClock = Convert-ToNumber $cpuPerf.ProcessorFrequency ([double]$cpuStatic.CurrentClockSpeed)
  $cpuPerformanceRatio = Convert-ToNumber $cpuPerf.PercentProcessorPerformance 100
  $cpuCurrentClock = if ($cpuReportedClock -gt 0) { [math]::Round($cpuReportedClock * $cpuPerformanceRatio / 100, 0) } else { 0 }
  $cpuClockState = Get-ClockState $cpuCurrentClock $cpuBaseClock $cpuBoostClock
  $available = [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableBytes
  $memory = [math]::Round((1 - $available / $totalMemoryBytes) * 100, 1)
  $diskPerformance = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -match '^1( |$)' } | Select-Object -First 1
  $gpuRaw = & nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.current.graphics,clocks.current.memory,clocks.max.graphics,clocks.max.memory,pstate --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  $gpuValues = if ($gpuRaw) { @(($gpuRaw -split ',') | ForEach-Object { $_.Trim() }) } else { @() }
  $gpuName = if ($gpuValues.Count -ge 1) { [string]$gpuValues[0] } else { 'GPU no identificada' }
  $gpuLoad = if ($gpuValues.Count -ge 2) { Convert-ToNumber $gpuValues[1] } else { 0 }
  $vramUsedMb = if ($gpuValues.Count -ge 3) { Convert-ToNumber $gpuValues[2] } else { 0 }
  $vramTotalMb = if ($gpuValues.Count -ge 4) { Convert-ToNumber $gpuValues[3] } else { 0 }
  $gpuTemperature = if ($gpuValues.Count -ge 5) { Convert-ToNumber $gpuValues[4] } else { 0 }
  $gpuPower = if ($gpuValues.Count -ge 6) { Convert-ToNumber $gpuValues[5] } else { 0 }
  $gpuPowerLimit = if ($gpuValues.Count -ge 7) { Convert-ToNumber $gpuValues[6] } else { 0 }
  $gpuCoreClock = if ($gpuValues.Count -ge 8) { Convert-ToNumber $gpuValues[7] } else { 0 }
  $gpuMemoryClock = if ($gpuValues.Count -ge 9) { Convert-ToNumber $gpuValues[8] } else { 0 }
  $gpuDriverMaxClock = if ($gpuValues.Count -ge 10) { Convert-ToNumber $gpuValues[9] } else { 0 }
  $gpuDriverMaxMemoryClock = if ($gpuValues.Count -ge 11) { Convert-ToNumber $gpuValues[10] } else { 0 }
  $gpuPstate = if ($gpuValues.Count -ge 12) { [string]$gpuValues[11] } else { 'N/A' }
  $gpuReference = Find-HardwareReference $hardwareCatalog.gpus $gpuName
  $gpuCoreBaseClock = if ($gpuReference.coreBaseMHz) { [double]$gpuReference.coreBaseMHz } elseif ($gpuDriverMaxClock -gt 0) { [math]::Round($gpuDriverMaxClock * 0.75, 0) } else { 0 }
  $gpuCoreBoostClock = if ($gpuReference.coreBoostMHz) { [double]$gpuReference.coreBoostMHz } else { $gpuDriverMaxClock }
  $gpuMemoryStockClock = if ($gpuReference.memoryStockMHz) { [double]$gpuReference.memoryStockMHz } else { $gpuDriverMaxMemoryClock }
  $gpuClockState = if ($manualGpuOc.detected -and [double]$manualGpuOc.coreOffset -ne 0) { 'xoc_manual' } else { Get-ClockState $gpuCoreClock $gpuCoreBaseClock $gpuCoreBoostClock }
  $gpuMemoryClockState = if ($manualGpuOc.detected -and [double]$manualGpuOc.memoryOffset -ne 0) { 'xoc_manual' } else { Get-ClockState $gpuMemoryClock $gpuMemoryStockClock $gpuMemoryStockClock }
  $vramPercent = if ($vramTotalMb -gt 0) { [math]::Round($vramUsedMb / $vramTotalMb * 100, 1) } else { 0 }
  $vramByPid = @{}
  Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | ForEach-Object {
    if ([string]$_.Name -match 'pid_(\d+)') {
      $gpuPid = [string]$matches[1]
      $dedicated = Convert-ToNumber $_.DedicatedUsage
      if (-not $vramByPid.ContainsKey($gpuPid)) { $vramByPid[$gpuPid] = 0.0 }
      $vramByPid[$gpuPid] += $dedicated
    }
  }
  $sampleTime = [DateTime]::UtcNow
  $sampleSeconds = [math]::Max(0.25, ($sampleTime - $script:lastProcessSample).TotalSeconds)
  $newSamples = @{}
  $processRows = @(
    Get-Process | ForEach-Object {
      $process = $_
      $totalCpu = 0.0
      $startTicks = 0L
      try { if ($null -ne $process.CPU) { $totalCpu = [double]$process.CPU } } catch {}
      try { $startTicks = $process.StartTime.ToUniversalTime().Ticks } catch {}
      $key = [string]$process.Id
      $cpuPercent = 0.0
      if ($script:previousProcessCpu.ContainsKey($key)) {
        $previous = $script:previousProcessCpu[$key]
        if ($previous.startTicks -eq $startTicks -and $totalCpu -ge $previous.cpu) {
          $cpuPercent = (($totalCpu - $previous.cpu) / $sampleSeconds) * 100 / $script:logicalProcessors
        }
      }
      $newSamples[$key] = [ordered]@{ cpu = $totalCpu; startTicks = $startTicks }
      $ramMb = 0.0
      try { $ramMb = [double]$process.WorkingSet64 / 1MB } catch {}
      $processVramMb = if ($vramByPid.ContainsKey($key)) { [double]$vramByPid[$key] / 1MB } else { 0 }
      [pscustomobject]@{
        process = $process
        name = [string]$process.ProcessName
        pid = [int]$process.Id
        cpu = [math]::Round([math]::Min(100, [math]::Max(0, $cpuPercent)), 1)
        ram = [math]::Round($ramMb, 1)
        vram = [math]::Round($processVramMb, 1)
        startTicks = $startTicks
        score = ($cpuPercent * 30) + ($ramMb / 10) + ($processVramMb / 8)
      }
    }
  )
  $script:previousProcessCpu = $newSamples
  $script:lastProcessSample = $sampleTime
  $topProcesses = @($processRows | Sort-Object score -Descending | Select-Object -First 15)
  $processes = @(
    $topProcesses | ForEach-Object {
      $row = $_
      $safety = Get-ProcessSafety $row.process
      $priority = 'Unknown'
      try { $priority = $row.process.PriorityClass.ToString() } catch {}
      [ordered]@{
        name = $row.name
        pid = $row.pid
        cpu = $row.cpu
        ram = $row.ram
        vram = $row.vram
        priority = $priority
        company = $safety.company
        path = $safety.path
        canOptimize = [bool]$safety.allowed
        protectionReason = $safety.reason
        paused = $script:pausedProcesses.ContainsKey([string]$row.pid)
        startTicks = $row.startTicks
      }
    }
  )
  $vramTopRow = $processRows | Where-Object { $_.vram -gt 0 } | Sort-Object vram -Descending | Select-Object -First 1
  $vramTopProcess = if ($vramTopRow) {
    [ordered]@{ name = [string]$vramTopRow.name; pid = [int]$vramTopRow.pid; used = [double]$vramTopRow.vram }
  } else {
    [ordered]@{ name = 'Sin datos'; pid = 0; used = 0 }
  }

  return [ordered]@{
    cpu = [math]::Round($cpu, 1)
    cpuName = $cpuName
    cpuCores = [int]$cpuStatic.NumberOfCores
    cpuThreads = [int]$cpuStatic.NumberOfLogicalProcessors
    cpuClock = $cpuCurrentClock
    cpuBaseClock = [math]::Round($cpuBaseClock, 0)
    cpuBoostClock = [math]::Round($cpuBoostClock, 0)
    cpuClockState = $cpuClockState
    cpuReferenceSource = if ($cpuReference.sourceLabel) { [string]$cpuReference.sourceLabel } else { 'Windows / WMI' }
    memory = $memory
    gpu = [math]::Round($gpuLoad, 1)
    gpuName = $gpuName
    gpuTemp = [math]::Round($gpuTemperature, 1)
    gpuPower = [math]::Round($gpuPower, 1)
    gpuPowerLimit = [math]::Round($gpuPowerLimit, 1)
    gpuPstate = $gpuPstate
    gpuCoreClock = [math]::Round($gpuCoreClock, 0)
    gpuCoreBaseClock = [math]::Round($gpuCoreBaseClock, 0)
    gpuCoreBoostClock = [math]::Round($gpuCoreBoostClock, 0)
    gpuClockState = $gpuClockState
    gpuMemoryClock = [math]::Round($gpuMemoryClock, 0)
    gpuMemoryStockClock = [math]::Round($gpuMemoryStockClock, 0)
    gpuMemoryClockState = $gpuMemoryClockState
    gpuManualOcDetected = [bool]$manualGpuOc.detected
    gpuManualCoreOffset = [double]$manualGpuOc.coreOffset
    gpuManualMemoryOffset = [double]$manualGpuOc.memoryOffset
    gpuManualOcSource = $manualGpuOc.source
    gpuReferenceSource = if ($gpuReference.sourceLabel) { [string]$gpuReference.sourceLabel } else { 'Controlador NVIDIA' }
    vram = $vramPercent
    vramUsed = [math]::Round($vramUsedMb / 1024, 1)
    vramTotal = [math]::Round($vramTotalMb / 1024, 1)
    vramTopProcess = $vramTopProcess
    disk = if ($diskPerformance) { [math]::Min(100, [double]$diskPerformance.PercentDiskTime) } else { 0 }
    read = if ($diskPerformance) { [math]::Round($diskPerformance.DiskReadBytesPerSec / 1MB, 1) } else { 0 }
    write = if ($diskPerformance) { [math]::Round($diskPerformance.DiskWriteBytesPerSec / 1MB, 1) } else { 0 }
    time = (Get-Date).ToString('HH:mm:ss')
    uptime = ((Get-Date) - $osStatic.LastBootUpTime).ToString('d\d\ h\h\ m\m')
    memoryUsed = [math]::Round(($totalMemoryBytes - $available) / 1GB, 1)
    memoryTotal = [math]::Round($totalMemoryBytes / 1GB, 1)
    diskName = $diskLabel
    diskFree = if ($volumeStatic) { [math]::Round($volumeStatic.FreeSpace / 1GB, 1) } else { 0 }
    processes = $processes
  }
}

function ConvertTo-SafeText($value, [string]$fallback, [int]$maxLength = 240) {
  $text = [string]$value
  if (-not $text) { return $fallback }
  $text = $text.Trim()
  if ($text.Length -gt $maxLength) { $text = $text.Substring(0, $maxLength) }
  return $text
}

function Get-OptimizationCandidates($metrics) {
  $candidates = New-Object System.Collections.ArrayList
  foreach ($process in @($metrics.processes)) {
    if (-not $process.canOptimize -or $process.paused) { continue }
    $name = [string]$process.name
    $priority = [string]$process.priority
    $isBackground = $name -match $backgroundProcessPattern
    $action = $null
    $risk = 'bajo'
    $benefit = $null
    $reason = $null

    if ([double]$process.cpu -ge 5 -and $priority -notin @('BelowNormal', 'Idle')) {
      $action = 'priority_low'
      $benefit = 'Da preferencia a tus aplicaciones principales cuando la CPU se satura.'
      $reason = "Está usando $($process.cpu)% de CPU y su prioridad actual es $priority."
    } elseif ($isBackground -and [double]$process.ram -ge 350) {
      $action = 'pause_5m'
      $risk = 'medio'
      $benefit = 'Detiene temporalmente su actividad; Windows puede recuperar parte de la memoria si hace falta.'
      $reason = "Parece una tarea secundaria y ocupa $([math]::Round([double]$process.ram)) MB de RAM."
    }
    if (-not $action) { continue }

    $id = "$([int]$process.pid):$name"
    [void]$candidates.Add([ordered]@{
      id = $id
      pid = [int]$process.pid
      name = $name
      company = [string]$process.company
      cpu = [double]$process.cpu
      ram = [double]$process.ram
      priority = $priority
      startTicks = [long]$process.startTicks
      action = $action
      actionLabel = if ($action -eq 'pause_5m') { 'PAUSAR 5 MIN' } else { 'BAJAR PRIORIDAD' }
      summary = if ($action -eq 'pause_5m') { "Pausar temporalmente $name" } else { "Dar menos prioridad a $name" }
      reason = $reason
      benefit = $benefit
      risk = $risk
    })
  }
  return @($candidates | Select-Object -First 8)
}

function Invoke-AiOptimizationReview($candidates, [string]$profile, [string]$experience) {
  if (-not $candidates -or $candidates.Count -eq 0) { return @() }
  $status = Get-AiStatus
  if (-not $status.available) { return @($candidates | Select-Object -First 5) }

  try {
    $candidatePayload = @($candidates | ForEach-Object {
      [ordered]@{ id = $_.id; name = $_.name; company = $_.company; cpu = $_.cpu; ram = $_.ram; priority = $_.priority; action = $_.action; risk = $_.risk }
    })
    $prompt = @"
Eres REEBI, analista local de rendimiento. Ordena hasta cinco candidatos para el perfil $profile y un usuario de nivel $experience.
Sólo puedes usar los IDs recibidos. No inventes procesos, no cambies la acción permitida y no llames virus a nada.
Devuelve JSON con esta forma exacta: {"recommendations":[{"id":"...","summary":"...","reason":"...","benefit":"...","risk":"bajo|medio"}]}.
Explica en español mexicano, claro y breve. Candidatos: $($candidatePayload | ConvertTo-Json -Depth 6 -Compress)
"@
    $request = [ordered]@{
      model = $status.model
      stream = $false
      think = $false
      format = 'json'
      keep_alive = '10m'
      options = [ordered]@{ temperature = 0.1; num_ctx = 4096; num_predict = 650 }
      messages = @([ordered]@{ role = 'user'; content = $prompt })
    }
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 60
    $review = ([string]$response.message.content) | ConvertFrom-Json
    $byId = @{}
    foreach ($candidate in $candidates) { $byId[[string]$candidate.id] = $candidate }
    $result = New-Object System.Collections.ArrayList
    foreach ($entry in @($review.recommendations)) {
      $id = [string]$entry.id
      if (-not $byId.ContainsKey($id)) { continue }
      $candidate = $byId[$id]
      [void]$result.Add([ordered]@{
        id = $candidate.id
        pid = $candidate.pid
        name = $candidate.name
        company = $candidate.company
        cpu = $candidate.cpu
        ram = $candidate.ram
        priority = $candidate.priority
        startTicks = $candidate.startTicks
        action = $candidate.action
        actionLabel = $candidate.actionLabel
        summary = ConvertTo-SafeText $entry.summary $candidate.summary 100
        reason = ConvertTo-SafeText $entry.reason $candidate.reason 240
        benefit = ConvertTo-SafeText $entry.benefit $candidate.benefit 240
        risk = if ([string]$entry.risk -eq 'medio') { 'medio' } else { $candidate.risk }
      })
      if ($result.Count -ge 5) { break }
    }
    if ($result.Count -gt 0) { return @($result) }
  } catch {}
  return @($candidates | Select-Object -First 5)
}

function Get-OptimizationRecommendations($requestBody) {
  Remove-ExpiredActionState
  $metrics = Get-MetricsSnapshot
  $candidates = Get-OptimizationCandidates $metrics
  $profile = if ($requestBody.profile) { [string]$requestBody.profile } else { 'Studio' }
  $experience = if ($requestBody.experience) { [string]$requestBody.experience } else { 'intermedio' }
  $reviewed = Invoke-AiOptimizationReview $candidates $profile $experience
  $status = Get-AiStatus
  $recommendations = @(
    $reviewed | ForEach-Object {
      $planId = New-SecureToken
      $expiresAt = [DateTime]::UtcNow.AddMinutes(5)
      $script:actionPlans[$planId] = [pscustomobject]@{
        expiresAt = $expiresAt
        pid = [int]$_.pid
        name = [string]$_.name
        startTicks = [long]$_.startTicks
        action = [string]$_.action
      }
      [ordered]@{
        planId = $planId
        expiresAt = $expiresAt.ToString('o')
        pid = [int]$_.pid
        name = [string]$_.name
        company = [string]$_.company
        cpu = [double]$_.cpu
        ram = [double]$_.ram
        priority = [string]$_.priority
        action = [string]$_.action
        actionLabel = [string]$_.actionLabel
        summary = [string]$_.summary
        reason = [string]$_.reason
        benefit = [string]$_.benefit
        risk = [string]$_.risk
      }
    }
  )
  return [ordered]@{
    engine = if ($status.available) { 'ollama' } else { 'rules' }
    model = $status.model
    scannedAt = [DateTime]::UtcNow.ToString('o')
    recommendations = $recommendations
    message = if ($recommendations.Count -gt 0) { 'REEBI encontró cambios reversibles que podrían ayudar.' } else { 'No encontré un proceso que convenga tocar ahora. Optimizar sin evidencia también puede empeorar el rendimiento.' }
  }
}

function Get-ValidatedActionProcess($plan) {
  $process = Get-Process -Id ([int]$plan.pid) -ErrorAction Stop
  if (-not [string]::Equals([string]$process.ProcessName, [string]$plan.name, [StringComparison]::OrdinalIgnoreCase)) { throw 'El PID ahora pertenece a otro proceso.' }
  $startTicks = $process.StartTime.ToUniversalTime().Ticks
  if ($startTicks -ne [long]$plan.startTicks) { throw 'El proceso cambió desde el análisis. Vuelve a escanear.' }
  $safety = Get-ProcessSafety $process
  if (-not $safety.allowed) { throw $safety.reason }
  return $process
}

function Start-ResumeWatchdog([int]$processId, [long]$startTicks) {
  $watchdog = Join-Path $PSScriptRoot 'resume-process.ps1'
  if (-not (Test-Path -LiteralPath $watchdog)) { throw 'Falta el mecanismo de reanudación de seguridad.' }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = 'powershell.exe'
  $info.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`" -TargetProcessId $processId -ExpectedStartTicks $startTicks -DelaySeconds 300"
  $info.WorkingDirectory = $PSScriptRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  [void][Diagnostics.Process]::Start($info)
}

function Invoke-ReebotAction($requestBody) {
  Remove-ExpiredActionState
  if ([string]$requestBody.confirmation -ne 'CONFIRMADO_POR_USUARIO') { throw 'Falta la confirmación explícita del usuario.' }
  $planId = [string]$requestBody.planId
  if (-not $planId -or -not $script:actionPlans.ContainsKey($planId)) { throw 'El plan venció o no existe. Vuelve a analizar.' }
  $plan = $script:actionPlans[$planId]
  $script:actionPlans.Remove($planId)
  if ($plan.expiresAt -lt [DateTime]::UtcNow) { throw 'El plan venció. Vuelve a analizar.' }
  $process = Get-ValidatedActionProcess $plan
  $undoToken = New-SecureToken
  $message = $null

  if ($plan.action -eq 'priority_low') {
    $previousPriority = $process.PriorityClass.ToString()
    $process.PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
    $script:undoActions[$undoToken] = [pscustomobject]@{
      expiresAt = [DateTime]::UtcNow.AddHours(1)
      pid = [int]$process.Id
      name = [string]$process.ProcessName
      startTicks = $process.StartTime.ToUniversalTime().Ticks
      action = 'priority_restore'
      previousPriority = $previousPriority
    }
    $message = "Bajé la prioridad de $($process.ProcessName). No cerré el proceso ni cambié sus archivos."
  } elseif ($plan.action -eq 'pause_5m') {
    $key = [string]$process.Id
    if ($script:pausedProcesses.ContainsKey($key)) { throw 'REEBOT ya pausó este proceso.' }
    $status = [ReebotNative.ProcessControl]::NtSuspendProcess($process.Handle)
    if ($status -ne 0) { throw "Windows rechazó la pausa (código $status)." }
    $startTicks = $process.StartTime.ToUniversalTime().Ticks
    $script:pausedProcesses[$key] = $startTicks
    try { Start-ResumeWatchdog ([int]$process.Id) $startTicks } catch {
      [void][ReebotNative.ProcessControl]::NtResumeProcess($process.Handle)
      $script:pausedProcesses.Remove($key)
      throw
    }
    $script:undoActions[$undoToken] = [pscustomobject]@{
      expiresAt = [DateTime]::UtcNow.AddMinutes(10)
      pid = [int]$process.Id
      name = [string]$process.ProcessName
      startTicks = $startTicks
      action = 'resume'
      previousPriority = $null
    }
    $message = "Pausé $($process.ProcessName) durante un máximo de cinco minutos. Se reanudará automáticamente aunque cierres REEBOT."
  } else {
    throw 'La acción no está permitida.'
  }

  Write-ActionAudit ([ordered]@{ action = $plan.action; pid = [int]$process.Id; name = [string]$process.ProcessName; result = 'success' })
  return [ordered]@{ ok = $true; action = $plan.action; pid = [int]$process.Id; name = [string]$process.ProcessName; message = $message; undoToken = $undoToken }
}

function Undo-ReebotAction($requestBody) {
  Remove-ExpiredActionState
  $undoToken = [string]$requestBody.undoToken
  if (-not $undoToken -or -not $script:undoActions.ContainsKey($undoToken)) { throw 'La opción de deshacer venció o ya fue utilizada.' }
  $record = $script:undoActions[$undoToken]
  $script:undoActions.Remove($undoToken)
  $process = Get-Process -Id ([int]$record.pid) -ErrorAction Stop
  if (-not [string]::Equals([string]$process.ProcessName, [string]$record.name, [StringComparison]::OrdinalIgnoreCase)) { throw 'El proceso cambió y no se modificará.' }
  if ($process.StartTime.ToUniversalTime().Ticks -ne [long]$record.startTicks) { throw 'El proceso cambió y no se modificará.' }

  if ($record.action -eq 'priority_restore') {
    $priority = [Enum]::Parse([Diagnostics.ProcessPriorityClass], [string]$record.previousPriority)
    $process.PriorityClass = $priority
    $message = "Restauré la prioridad anterior de $($process.ProcessName)."
  } elseif ($record.action -eq 'resume') {
    [void][ReebotNative.ProcessControl]::NtResumeProcess($process.Handle)
    $script:pausedProcesses.Remove([string]$process.Id)
    $message = "Reanudé $($process.ProcessName)."
  } else {
    throw 'La acción no se puede deshacer.'
  }
  Write-ActionAudit ([ordered]@{ action = $record.action; pid = [int]$process.Id; name = [string]$process.ProcessName; result = 'undone' })
  return [ordered]@{ ok = $true; message = $message }
}

function Get-SystemPrompt($requestBody, $metrics, [string]$model) {
  $profile = if ($requestBody.profile) { [string]$requestBody.profile } else { 'Estudio' }
  $experience = if ($requestBody.experience) { [string]$requestBody.experience } else { 'intermedio' }
  $processSummary = @($metrics.processes | Select-Object -First 8 | ForEach-Object { "$($_.name) (PID $($_.pid), RAM $([math]::Round([double]$_.ram)) MB)" }) -join '; '
  if (-not $processSummary) { $processSummary = 'sin procesos disponibles' }

  return @"
Eres REEBI, la mascota, IA y compañera de la PC dentro de REEBOT LAB. Hablas en español mexicano, claro, breve y humano. El usuario tiene nivel $experience y perfil $profile.
Te ejecutas localmente mediante Ollama con el modelo $model. Explica hechos, separa hipótesis y propone pruebas seguras. Nunca afirmes que un proceso es virus sólo por su nombre. El chat no ejecuta órdenes: para cambiar prioridad o pausar un proceso, dirige al usuario a Procesos, donde el agente vuelve a validar y pide confirmación.
El porcentaje de disco significa actividad, no espacio ocupado. Una GPU con uso alto está trabajando; sólo es advertencia si la temperatura o la estabilidad indican un problema. La CPU por proceso se calcula mediante una muestra entre lecturas y puede tardar un ciclo en aparecer.
Responde en 2 a 5 frases: interpretación comprensible, evidencia y siguiente paso concreto.

Métricas actuales:
- CPU: $($metrics.cpu)%, reloj $($metrics.cpuClock) MHz, base $($metrics.cpuBaseClock), boost $($metrics.cpuBoostClock), zona $($metrics.cpuClockState)
- GPU: $($metrics.gpu)%, temperatura $($metrics.gpuTemp) °C, reloj $($metrics.gpuCoreClock) MHz, zona $($metrics.gpuClockState)
- OC GPU detectado: $($metrics.gpuManualOcDetected), núcleo $($metrics.gpuManualCoreOffset) MHz, memoria $($metrics.gpuManualMemoryOffset) MHz, fuente $($metrics.gpuManualOcSource)
- VRAM: $($metrics.vram)% ($($metrics.vramUsed) de $($metrics.vramTotal) GB), mayor proceso $($metrics.vramTopProcess.name) con $($metrics.vramTopProcess.used) MB
- RAM: $($metrics.memory)% ($($metrics.memoryUsed) de $($metrics.memoryTotal) GB)
- Actividad de disco: $($metrics.disk)%, lectura $($metrics.read) MB/s, escritura $($metrics.write) MB/s
- Unidad: $($metrics.diskName), $($metrics.diskFree) GB libres
- Procesos visibles: $processSummary
"@
}

function Invoke-LocalChat($requestBody) {
  $message = [string]$requestBody.message
  if (-not $message) { throw 'La pregunta está vacía.' }
  if ($message.Length -gt 4000) { $message = $message.Substring(0, 4000) }
  $metrics = $requestBody.metrics
  if (-not $metrics) { $metrics = Get-MetricsSnapshot }
  $status = Get-AiStatus
  if (-not $status.available) { throw $status.reason }

  $messages = New-Object System.Collections.ArrayList
  [void]$messages.Add([ordered]@{ role = 'system'; content = Get-SystemPrompt $requestBody $metrics $status.model })
  $history = @($requestBody.history | Select-Object -Last 8)
  foreach ($entry in $history) {
    $role = if ([string]$entry.role -eq 'assistant') { 'assistant' } else { 'user' }
    $content = [string]$entry.content
    if ($content.Length -gt 4000) { $content = $content.Substring(0, 4000) }
    if ($content) { [void]$messages.Add([ordered]@{ role = $role; content = $content }) }
  }
  [void]$messages.Add([ordered]@{ role = 'user'; content = $message })

  $ollamaRequest = [ordered]@{
    model = $status.model
    stream = $false
    think = $false
    keep_alive = '10m'
    options = [ordered]@{ temperature = 0.35; num_ctx = 8192; num_predict = 480 }
    messages = $messages
  }
  $ollamaResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json' -Body ($ollamaRequest | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 120
  $reply = [string]$ollamaResponse.message.content
  if (-not $reply) { throw 'Ollama devolvió una respuesta vacía.' }
  return [ordered]@{ reply = $reply.Trim(); engine = 'ollama'; model = $status.model; reason = 'Respuesta procesada por el agente local de REEBOT.' }
}

if ($SelfTest) {
  $testExecutable = Join-Path $env:TEMP "reebot-action-test-$PID.exe"
  $actionAuditPath = Join-Path $env:TEMP "reebot-action-test-$PID.jsonl"
  $testProcess = $null
  $exitCode = 1
  try {
    [IO.File]::Copy((Join-Path $env:WINDIR 'System32\ping.exe'), $testExecutable, $true)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $testExecutable
    $info.Arguments = '-n 30 127.0.0.1'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $testProcess = [Diagnostics.Process]::Start($info)
    Start-Sleep -Milliseconds 250
    $testProcess.Refresh()
    $previousPriority = $testProcess.PriorityClass.ToString()
    $planId = New-SecureToken
    $script:actionPlans[$planId] = [pscustomobject]@{
      expiresAt = [DateTime]::UtcNow.AddMinutes(1)
      pid = [int]$testProcess.Id
      name = [string]$testProcess.ProcessName
      startTicks = $testProcess.StartTime.ToUniversalTime().Ticks
      action = 'priority_low'
    }
    $result = Invoke-ReebotAction ([pscustomobject]@{ planId = $planId; confirmation = 'CONFIRMADO_POR_USUARIO' })
    $testProcess.Refresh()
    if (-not $result.ok -or $testProcess.PriorityClass -ne [Diagnostics.ProcessPriorityClass]::BelowNormal) { throw 'No se aplicó la prioridad.' }
    $undone = Undo-ReebotAction ([pscustomobject]@{ undoToken = $result.undoToken })
    $testProcess.Refresh()
    if (-not $undone.ok -or $testProcess.PriorityClass.ToString() -ne $previousPriority) { throw 'No se restauró la prioridad.' }
    $exitCode = 0
  } catch {
    Write-Error $_.Exception.Message
  } finally {
    if ($testProcess -and -not $testProcess.HasExited) { $testProcess.Kill() }
    if (Test-Path -LiteralPath $testExecutable) { [IO.File]::Delete($testExecutable) }
    if (Test-Path -LiteralPath $actionAuditPath) { [IO.File]::Delete($actionAuditPath) }
  }
  exit $exitCode
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:47831/')
$listener.Start()

Write-Host ''
Write-Host '  REEBOT LOCAL AGENT' -ForegroundColor Cyan
Write-Host '  Estado: conectado' -ForegroundColor Green
Write-Host "  Código de vinculación: $pairCode" -ForegroundColor Magenta
Write-Host '  Mantén esta ventana abierta mientras uses REEBOT LAB.' -ForegroundColor DarkGray
Write-Host ''

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  Set-CorsHeaders $ctx
  $origin = [string]$ctx.Request.Headers['Origin']

  if ($ctx.Request.HttpMethod -eq 'OPTIONS') {
    if ($origin -and -not (Test-IsAllowedOrigin $origin)) {
      Write-JsonResponse $ctx 403 @{ error = 'Origen no permitido.' }
    } else {
      $ctx.Response.StatusCode = 204
      $ctx.Response.Close()
    }
    continue
  }

  if ($origin -and -not (Test-IsAllowedOrigin $origin)) {
    Write-JsonResponse $ctx 403 @{ error = 'Origen no permitido.' }
    continue
  }

  $path = $ctx.Request.Url.AbsolutePath.TrimEnd('/')
  if (-not $path) { $path = '/' }
  $authorized = Test-IsAuthorized $ctx

  if ($path -in @('/optimization/scan', '/actions/execute', '/actions/undo') -and -not (Test-IsLocalAppOrigin $origin)) {
    Write-JsonResponse $ctx 403 @{ error = 'Los cambios directos sólo están disponibles en la app local de REEBOT LAB.' }
    continue
  }

  try {
    if ($path -eq '/bridge/status' -and $ctx.Request.HttpMethod -eq 'GET') {
      $aiStatus = Get-AiStatus
      if ($authorized) {
        Write-JsonResponse $ctx 200 ([ordered]@{ available = $true; paired = $true; version = $bridgeVersion; engine = $aiStatus.engine; model = $aiStatus.model; reason = $aiStatus.reason })
      } else {
        Write-JsonResponse $ctx 401 ([ordered]@{ available = $true; paired = $false; version = $bridgeVersion; engine = 'basic'; model = $null; reason = 'El agente local está disponible y necesita vinculación.' })
      }
      continue
    }

    if ($path -eq '/pair-code' -and $ctx.Request.HttpMethod -eq 'GET') {
      if (-not (Test-IsLocalOrigin $origin)) {
        Write-JsonResponse $ctx 403 @{ error = 'El código sólo se muestra en la interfaz local.' }
      } else {
        Write-JsonResponse $ctx 200 @{ code = $pairCode }
      }
      continue
    }

    if ($path -eq '/pair' -and $ctx.Request.HttpMethod -eq 'POST') {
      if ((Get-Date) -lt $pairLockedUntil) {
        Write-JsonResponse $ctx 429 @{ error = 'Demasiados intentos. Espera un minuto.' }
        continue
      }
      $requestBody = Read-JsonBody $ctx
      if ([string]$requestBody.code -ne $pairCode) {
        $pairAttempts += 1
        if ($pairAttempts -ge 5) {
          $pairAttempts = 0
          $pairLockedUntil = (Get-Date).AddMinutes(1)
        }
        Write-JsonResponse $ctx 401 @{ error = 'Código incorrecto.' }
      } else {
        $pairAttempts = 0
        $pairCode = New-PairCode
        Write-JsonResponse $ctx 200 @{ token = $bridgeToken; paired = $true }
      }
      continue
    }

    if ($path -eq '/bridge/revoke' -and $ctx.Request.HttpMethod -eq 'POST') {
      if (-not $authorized) {
        Write-JsonResponse $ctx 401 @{ error = 'Vinculación requerida.' }
      } else {
        $bridgeToken = New-SecureToken
        $pairCode = New-PairCode
        Save-BridgeState
        Write-JsonResponse $ctx 200 @{ revoked = $true }
      }
      continue
    }

    if (-not $authorized) {
      Write-JsonResponse $ctx 401 @{ error = 'Vincula esta página con el agente local de REEBOT.' }
      continue
    }

    if ($path -eq '/metrics' -and $ctx.Request.HttpMethod -eq 'GET') {
      Write-JsonResponse $ctx 200 (Get-MetricsSnapshot)
    } elseif ($path -eq '/ai/status' -and $ctx.Request.HttpMethod -eq 'GET') {
      Write-JsonResponse $ctx 200 (Get-AiStatus)
    } elseif ($path -eq '/ai/chat' -and $ctx.Request.HttpMethod -eq 'POST') {
      try {
        Write-JsonResponse $ctx 200 (Invoke-LocalChat (Read-JsonBody $ctx))
      } catch {
        Write-JsonResponse $ctx 503 @{ error = $_.Exception.Message; engine = 'basic'; model = $null; reason = 'La IA local no respondió.' }
      }
    } elseif ($path -eq '/optimization/scan' -and $ctx.Request.HttpMethod -eq 'POST') {
      try {
        Write-JsonResponse $ctx 200 (Get-OptimizationRecommendations (Read-JsonBody $ctx))
      } catch {
        Write-JsonResponse $ctx 500 @{ error = $_.Exception.Message }
      }
    } elseif ($path -eq '/actions/execute' -and $ctx.Request.HttpMethod -eq 'POST') {
      try {
        Write-JsonResponse $ctx 200 (Invoke-ReebotAction (Read-JsonBody $ctx))
      } catch {
        Write-JsonResponse $ctx 409 @{ error = $_.Exception.Message }
      }
    } elseif ($path -eq '/actions/undo' -and $ctx.Request.HttpMethod -eq 'POST') {
      try {
        Write-JsonResponse $ctx 200 (Undo-ReebotAction (Read-JsonBody $ctx))
      } catch {
        Write-JsonResponse $ctx 409 @{ error = $_.Exception.Message }
      }
    } else {
      Write-JsonResponse $ctx 404 @{ error = 'Ruta no encontrada.' }
    }
  } catch {
    if ($ctx.Response.OutputStream.CanWrite) {
      Write-JsonResponse $ctx 500 @{ error = 'El agente local encontró un error.' }
    }
  }
}
