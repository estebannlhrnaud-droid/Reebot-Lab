$ErrorActionPreference = 'SilentlyContinue'

$bridgeVersion = '0.2.1'
$bridgeStatePath = Join-Path $PSScriptRoot '.reebot-bridge.json'
$preferredModel = if ($env:REEBOT_AI_MODEL) { $env:REEBOT_AI_MODEL } else { 'qwen3.5:9b' }
$allowedHostedOrigins = @(
  'https://reebot-lab-preview.estebannlhrnaud.chatgpt.site'
)

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

$disk = Get-Disk -Number 1
$partition = Get-Partition -DiskNumber 1 | Where-Object DriveLetter | Select-Object -First 1
$diskLabel = "Disco 1 - $($disk.FriendlyName) ($($partition.DriveLetter):)"
$osStatic = Get-CimInstance Win32_OperatingSystem
$totalMemoryBytes = [double]$osStatic.TotalVisibleMemorySize * 1KB
$volumeStatic = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($partition.DriveLetter):'"

function Get-MetricsSnapshot {
  $cpu = [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $available = [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableBytes
  $memory = [math]::Round((1 - $available / $totalMemoryBytes) * 100, 1)
  $diskPerformance = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -match '^1( |$)' } | Select-Object -First 1
  $gpuRaw = & nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>$null
  $gpuValues = if ($gpuRaw) { @(($gpuRaw -split ',') | ForEach-Object { [double]($_.Trim()) }) } else { @(0, 0, 0, 0) }
  $gpuLoad = if ($gpuValues.Count -ge 1) { $gpuValues[0] } else { 0 }
  $vramUsedMb = if ($gpuValues.Count -ge 2) { $gpuValues[1] } else { 0 }
  $vramTotalMb = if ($gpuValues.Count -ge 3) { $gpuValues[2] } else { 0 }
  $gpuTemperature = if ($gpuValues.Count -ge 4) { $gpuValues[3] } else { 0 }
  $vramPercent = if ($vramTotalMb -gt 0) { [math]::Round($vramUsedMb / $vramTotalMb * 100, 1) } else { 0 }
  $processes = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10

  return [ordered]@{
    cpu = [math]::Round($cpu, 1)
    memory = $memory
    gpu = [math]::Round($gpuLoad, 1)
    gpuTemp = [math]::Round($gpuTemperature, 1)
    vram = $vramPercent
    vramUsed = [math]::Round($vramUsedMb / 1024, 1)
    vramTotal = [math]::Round($vramTotalMb / 1024, 1)
    disk = if ($diskPerformance) { [math]::Min(100, [double]$diskPerformance.PercentDiskTime) } else { 0 }
    read = if ($diskPerformance) { [math]::Round($diskPerformance.DiskReadBytesPerSec / 1MB, 1) } else { 0 }
    write = if ($diskPerformance) { [math]::Round($diskPerformance.DiskWriteBytesPerSec / 1MB, 1) } else { 0 }
    time = (Get-Date).ToString('HH:mm:ss')
    uptime = ((Get-Date) - $osStatic.LastBootUpTime).ToString('d\d\ h\h\ m\m')
    memoryUsed = [math]::Round(($totalMemoryBytes - $available) / 1GB, 1)
    memoryTotal = [math]::Round($totalMemoryBytes / 1GB, 1)
    diskName = $diskLabel
    diskFree = if ($volumeStatic) { [math]::Round($volumeStatic.FreeSpace / 1GB, 1) } else { 0 }
    processes = @($processes | ForEach-Object { [ordered]@{ name = $_.ProcessName; pid = [int]$_.Id; cpu = 0; ram = [math]::Round([double]$_.WorkingSet64 / 1MB, 1) } })
  }
}

function Get-SystemPrompt($requestBody, $metrics, [string]$model) {
  $profile = if ($requestBody.profile) { [string]$requestBody.profile } else { 'Estudio' }
  $experience = if ($requestBody.experience) { [string]$requestBody.experience } else { 'intermedio' }
  $processSummary = @($metrics.processes | Select-Object -First 8 | ForEach-Object { "$($_.name) (PID $($_.pid), RAM $([math]::Round([double]$_.ram)) MB)" }) -join '; '
  if (-not $processSummary) { $processSummary = 'sin procesos disponibles' }

  return @"
Eres REE, la mascota y compañera de la PC dentro de REEBOT LAB. Hablas en español mexicano, claro, breve y humano. El usuario tiene nivel $experience y perfil $profile.
Te ejecutas localmente mediante Ollama con el modelo $model. Explica hechos, separa hipótesis y propone pruebas seguras. Nunca afirmes que un proceso es virus sólo por su nombre. Antes de inspeccionar archivos, cerrar procesos o cambiar configuraciones, explica el impacto y pide permiso.
El porcentaje de disco significa actividad, no espacio ocupado. Una GPU con uso alto está trabajando; sólo es advertencia si la temperatura o la estabilidad indican un problema. La CPU por proceso todavía no es una medición real en esta versión.
Responde en 2 a 5 frases: interpretación comprensible, evidencia y siguiente paso concreto.

Métricas actuales:
- CPU: $($metrics.cpu)%
- GPU: $($metrics.gpu)%, temperatura $($metrics.gpuTemp) °C
- VRAM: $($metrics.vram)% ($($metrics.vramUsed) de $($metrics.vramTotal) GB)
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
    } else {
      Write-JsonResponse $ctx 404 @{ error = 'Ruta no encontrada.' }
    }
  } catch {
    if ($ctx.Response.OutputStream.CanWrite) {
      Write-JsonResponse $ctx 500 @{ error = 'El agente local encontró un error.' }
    }
  }
}
