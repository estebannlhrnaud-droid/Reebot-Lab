param(
  [switch]$OpenLocal
)

$ErrorActionPreference = 'SilentlyContinue'
$launcherVersion = '0.2.1'
$projectRoot = $PSScriptRoot
$publishedUrl = 'https://reebot-lab-preview.estebannlhrnaud.chatgpt.site'
$localUrl = 'http://localhost:3000'
$bridgePort = 47831
$script:nodePath = $null
$script:npmPath = $null
$script:ollamaPath = $null
$script:autoOpenLocal = [bool]$OpenLocal
$script:openedWhenReady = $false

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Find-Executable([string]$commandName, [string[]]$fallbacks) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and $command.Source) { return $command.Source }
  foreach ($candidate in $fallbacks) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Refresh-ExecutablePaths {
  $script:nodePath = Find-Executable 'node.exe' @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )
  $script:npmPath = $null
  if ($script:nodePath) {
    $script:npmPath = Join-Path (Split-Path -Parent $script:nodePath) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $script:npmPath)) {
      $script:npmPath = Find-Executable 'npm.cmd' @()
    }
  }
  $script:ollamaPath = Find-Executable 'ollama.exe' @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
    (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
  )
}

function Get-NodeVersion {
  if (-not $script:nodePath) { return $null }
  $raw = & $script:nodePath --version 2>$null
  if (-not $raw) { return $null }
  try { return [version]([string]$raw).Trim().TrimStart('v') } catch { return $null }
}

function Test-TcpPort([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $attempt = $client.ConnectAsync('127.0.0.1', $port)
    if (-not $attempt.Wait(450)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Test-WebReady([string]$url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Head -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-OllamaStatus {
  try {
    $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 2
    $models = @($tags.models | ForEach-Object {
      if ($_.name) { [string]$_.name } elseif ($_.model) { [string]$_.model }
    })
    $model = $models | Where-Object { $_ -eq 'qwen3.5:9b' } | Select-Object -First 1
    if (-not $model) { $model = $models | Where-Object { $_ -notmatch 'embed' } | Select-Object -First 1 }
    if ($model) { return @{ Ready = $true; Label = $model } }
    return @{ Ready = $false; Label = 'SIN MODELO' }
  } catch {
    $label = if ($script:ollamaPath) { 'DETENIDA' } else { 'NO INSTALADA' }
    return @{ Ready = $false; Label = $label }
  }
}

function Get-PairCode {
  if (-not (Test-TcpPort $bridgePort)) { return $null }
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$bridgePort/pair-code" -Headers @{ Origin = $localUrl } -TimeoutSec 2
    return [string]$response.code
  } catch {
    return $null
  }
}

function Open-Url([string]$url) {
  try {
    $explorer = Join-Path $env:WINDIR 'explorer.exe'
    Start-Process -FilePath $explorer -ArgumentList ('"{0}"' -f $url) -ErrorAction Stop | Out-Null
    return $true
  } catch {
    try {
      $info = New-Object System.Diagnostics.ProcessStartInfo
      $info.FileName = $url
      $info.UseShellExecute = $true
      [System.Diagnostics.Process]::Start($info) | Out-Null
      return $true
    } catch {
      [System.Windows.Forms.Clipboard]::SetText($url)
      [System.Windows.Forms.MessageBox]::Show(
        "Windows no pudo abrir el navegador. La direccion se copio al portapapeles:`r`n`r`n$url",
        'REEBOT LAB',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
      return $false
    }
  }
}

function Install-NodeJs {
  $winget = Find-Executable 'winget.exe' @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe')
  )
  if (-not $winget) {
    [void](Open-Url 'https://nodejs.org/en/download')
    [System.Windows.Forms.MessageBox]::Show(
      'No encontre winget en esta PC. Abri la pagina oficial de Node.js; instala la version LTS y vuelve a abrir el launcher.',
      'Instalacion manual',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    return $false
  }

  $script:activityLabel.Text = 'INSTALANDO NODE.JS...'
  $script:activityLabel.ForeColor = [Drawing.Color]::FromArgb(118, 72, 255)
  $script:form.Refresh()
  try {
    $arguments = @(
      'install',
      '--id', 'OpenJS.NodeJS.LTS',
      '--exact',
      '--source', 'winget',
      '--accept-package-agreements',
      '--accept-source-agreements'
    )
    $install = Start-Process -FilePath $winget -ArgumentList $arguments -Verb RunAs -Wait -PassThru -ErrorAction Stop
    if (-not $install -or $install.ExitCode -ne 0) { throw "winget termino con codigo $($install.ExitCode)" }
    Refresh-ExecutablePaths
    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion -or $nodeVersion -lt [version]'22.13.0') { throw 'Node.js no aparecio despues de la instalacion.' }
    [System.Windows.Forms.MessageBox]::Show(
      "Node.js $nodeVersion quedo instalado. REEBOT continuara con la preparacion local.",
      'Node.js listo',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    return $true
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      "No pude completar la instalacion automatica de Node.js.`r`n`r`n$($_.Exception.Message)",
      'REEBOT LAB',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    return $false
  }
}

function Start-OllamaIfAvailable {
  $status = Get-OllamaStatus
  if ($status.Ready -or -not $script:ollamaPath) { return }
  Start-Process -FilePath $script:ollamaPath -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
}

function Start-BridgeIfNeeded {
  if (Test-TcpPort $bridgePort) { return }
  $agentScript = Join-Path $projectRoot 'telemetry-server.ps1'
  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $agentScript)
  ) -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
}

function Confirm-Dependencies {
  if (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules')) { return $true }
  $choice = [System.Windows.Forms.MessageBox]::Show(
    "REEBOT LAB necesita preparar sus dependencias la primera vez. Se ejecutara npm install y puede tardar varios minutos.`r`n`r`nContinuar?",
    'Preparar REEBOT LAB',
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  if ($choice -ne [System.Windows.Forms.DialogResult]::Yes) { return $false }
  $script:activityLabel.Text = 'PREPARANDO COMPONENTES...'
  $script:activityLabel.ForeColor = [Drawing.Color]::FromArgb(118, 72, 255)
  $script:form.Refresh()
  $arguments = '/d /s /c ""{0}" install"' -f $script:npmPath
  $install = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WorkingDirectory $projectRoot -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
      'No se pudieron instalar las dependencias. Revisa tu conexion y ejecuta npm install desde esta carpeta.',
      'REEBOT LAB',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    return $false
  }
  return $true
}

function Start-LocalUi {
  Refresh-ExecutablePaths
  $nodeVersion = Get-NodeVersion
  if (-not $nodeVersion -or $nodeVersion -lt [version]'22.13.0' -or -not $script:npmPath) {
    $choice = [System.Windows.Forms.MessageBox]::Show(
      'El modo local necesita Node.js 22.13 o superior. Quieres que REEBOT lo instale automaticamente con winget?',
      'Falta Node.js',
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Information
    )
    if ($choice -ne [System.Windows.Forms.DialogResult]::Yes -or -not (Install-NodeJs)) { return }
    Refresh-ExecutablePaths
  }
  if (-not (Confirm-Dependencies)) { return }
  Start-OllamaIfAvailable
  Start-BridgeIfNeeded
  if (-not (Test-WebReady $localUrl)) {
    $arguments = '/d /s /c ""{0}" run dev"' -f $script:npmPath
    Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Minimized | Out-Null
  }
  $script:autoOpenLocal = $true
  $script:openedWhenReady = $false
  $script:activityLabel.Text = 'INICIANDO REEBOT...'
  $script:launchButton.Enabled = $false
}

function Start-PublishedUi {
  Start-OllamaIfAvailable
  Start-BridgeIfNeeded
  Open-Url $publishedUrl
  $script:activityLabel.Text = 'VERSION WEB ABIERTA'
}

function New-Label([string]$text, [int]$x, [int]$y, [int]$width, [int]$height, [float]$size, [Drawing.FontStyle]$style, [Drawing.Color]$color) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $text
  $label.Location = New-Object Drawing.Point($x, $y)
  $label.Size = New-Object Drawing.Size($width, $height)
  $label.Font = New-Object Drawing.Font('Segoe UI', $size, $style)
  $label.ForeColor = $color
  $label.BackColor = [Drawing.Color]::Transparent
  return $label
}

function New-StatusCard([string]$caption, [int]$x) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object Drawing.Point($x, 166)
  $panel.Size = New-Object Drawing.Size(218, 96)
  $panel.BackColor = [Drawing.Color]::FromArgb(248, 248, 248)
  $captionLabel = New-Label $caption 16 14 186 20 8 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(105, 105, 105))
  $valueLabel = New-Label 'COMPROBANDO' 16 40 186 34 14 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(20, 20, 20))
  $panel.Controls.Add($captionLabel)
  $panel.Controls.Add($valueLabel)
  $script:form.Controls.Add($panel)
  return @{ Panel = $panel; Value = $valueLabel }
}

function Set-CardStatus($card, [string]$text, [bool]$ready) {
  $card.Value.Text = $text
  $card.Value.ForeColor = if ($ready) { [Drawing.Color]::FromArgb(20, 20, 20) } else { [Drawing.Color]::FromArgb(118, 72, 255) }
  $card.Panel.BackColor = if ($ready) { [Drawing.Color]::FromArgb(239, 255, 248) } else { [Drawing.Color]::FromArgb(248, 248, 248) }
}

function Update-LauncherStatus {
  Refresh-ExecutablePaths
  $nodeVersion = Get-NodeVersion
  $nodeReady = $nodeVersion -and $nodeVersion -ge [version]'22.13.0'
  $nodeLabel = if ($nodeVersion) { "V$nodeVersion" } else { 'NO INSTALADO' }
  Set-CardStatus $script:nodeCard $nodeLabel $nodeReady

  $bridgeReady = Test-TcpPort $bridgePort
  $bridgeLabel = if ($bridgeReady) { 'ACTIVO' } else { 'DETENIDO' }
  Set-CardStatus $script:agentCard $bridgeLabel $bridgeReady

  $ollama = Get-OllamaStatus
  Set-CardStatus $script:aiCard $ollama.Label $ollama.Ready

  $pairCode = if ($bridgeReady) { Get-PairCode } else { $null }
  if ($pairCode) {
    $script:pairCodeLabel.Text = $pairCode
    $script:copyButton.Enabled = $true
  } else {
    $script:pairCodeLabel.Text = '------'
    $script:copyButton.Enabled = $false
  }

  $uiReady = Test-WebReady $localUrl
  if ($uiReady) {
    $script:launchButton.Text = 'ABRIR REEBOT'
    $script:launchButton.Enabled = $true
    $script:activityLabel.Text = if ($ollama.Ready) { 'SISTEMA LISTO + IA LOCAL' } else { 'SISTEMA LISTO + ANALISIS BASICO' }
    $script:activityLabel.ForeColor = [Drawing.Color]::FromArgb(32, 130, 90)
    if (-not $script:openedWhenReady -and $script:autoOpenLocal) {
      $script:openedWhenReady = $true
      Open-Url $localUrl
    }
  } elseif ($script:activityLabel.Text -ne 'INICIANDO REEBOT...' -and $script:activityLabel.Text -ne 'PREPARANDO COMPONENTES...') {
    $script:launchButton.Text = 'INICIAR EN LOCAL'
    $script:launchButton.Enabled = $true
    $script:activityLabel.Text = 'LISTO PARA INICIAR'
    $script:activityLabel.ForeColor = [Drawing.Color]::FromArgb(105, 105, 105)
  }
}

$script:form = New-Object System.Windows.Forms.Form
$script:form.Text = 'REEBOT LAB Launcher'
$script:form.ClientSize = New-Object Drawing.Size(760, 520)
$script:form.StartPosition = 'CenterScreen'
$script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$script:form.MaximizeBox = $false
$script:form.BackColor = [Drawing.Color]::White
$script:form.Icon = [Drawing.SystemIcons]::Application

$header = New-Object System.Windows.Forms.Panel
$header.Location = New-Object Drawing.Point(0, 0)
$header.Size = New-Object Drawing.Size(760, 132)
$header.BackColor = [Drawing.Color]::FromArgb(8, 8, 10)
$header.Controls.Add((New-Label 'REEBOT  LAB' 34 22 500 54 28 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::White)))
$header.Controls.Add((New-Label 'TU PC, POR FIN ENTENDIBLE.' 37 78 420 24 9 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(180, 170, 255))))
$versionLabel = New-Label "EARLY ACCESS  /  V$launcherVersion" 545 45 180 28 8 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(205, 205, 205))
$versionLabel.TextAlign = [Drawing.ContentAlignment]::MiddleRight
$header.Controls.Add($versionLabel)
$script:form.Controls.Add($header)

$script:form.Controls.Add((New-Label 'ESTADO DEL SISTEMA' 34 143 300 20 8 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(105, 105, 105))))
$script:nodeCard = New-StatusCard 'NODE.JS' 34
$script:agentCard = New-StatusCard 'AGENTE LOCAL' 271
$script:aiCard = New-StatusCard 'IA / OLLAMA' 508

$pairPanel = New-Object System.Windows.Forms.Panel
$pairPanel.Location = New-Object Drawing.Point(34, 282)
$pairPanel.Size = New-Object Drawing.Size(692, 82)
$pairPanel.BackColor = [Drawing.Color]::FromArgb(8, 8, 10)
$pairPanel.Controls.Add((New-Label 'CODIGO PARA VINCULAR LA VERSION WEB' 18 12 360 20 8 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(170, 170, 170))))
$script:pairCodeLabel = New-Label '------' 18 33 240 38 20 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::White)
$pairPanel.Controls.Add($script:pairCodeLabel)
$script:copyButton = New-Object System.Windows.Forms.Button
$script:copyButton.Text = 'COPIAR CODIGO'
$script:copyButton.Location = New-Object Drawing.Point(505, 22)
$script:copyButton.Size = New-Object Drawing.Size(165, 38)
$script:copyButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$script:copyButton.FlatAppearance.BorderColor = [Drawing.Color]::FromArgb(118, 72, 255)
$script:copyButton.BackColor = [Drawing.Color]::FromArgb(8, 8, 10)
$script:copyButton.ForeColor = [Drawing.Color]::White
$script:copyButton.Font = New-Object Drawing.Font('Segoe UI', 8, [Drawing.FontStyle]::Bold)
$script:copyButton.Enabled = $false
$script:copyButton.Add_Click({
  if ($script:pairCodeLabel.Text -match '^\d{6}$') {
    [System.Windows.Forms.Clipboard]::SetText($script:pairCodeLabel.Text)
    $script:copyButton.Text = 'COPIADO'
  }
})
$pairPanel.Controls.Add($script:copyButton)
$script:form.Controls.Add($pairPanel)

$script:launchButton = New-Object System.Windows.Forms.Button
$script:launchButton.Text = 'INICIAR EN LOCAL'
$script:launchButton.Location = New-Object Drawing.Point(34, 389)
$script:launchButton.Size = New-Object Drawing.Size(336, 54)
$script:launchButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$script:launchButton.FlatAppearance.BorderSize = 0
$script:launchButton.BackColor = [Drawing.Color]::FromArgb(8, 8, 10)
$script:launchButton.ForeColor = [Drawing.Color]::White
$script:launchButton.Font = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Bold)
$script:launchButton.Add_Click({
  if (Test-WebReady $localUrl) { Open-Url $localUrl } else { Start-LocalUi }
})
$script:form.Controls.Add($script:launchButton)

$webButton = New-Object System.Windows.Forms.Button
$webButton.Text = 'ABRIR VERSION WEB'
$webButton.Location = New-Object Drawing.Point(390, 389)
$webButton.Size = New-Object Drawing.Size(336, 54)
$webButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$webButton.FlatAppearance.BorderColor = [Drawing.Color]::FromArgb(8, 8, 10)
$webButton.BackColor = [Drawing.Color]::White
$webButton.ForeColor = [Drawing.Color]::FromArgb(8, 8, 10)
$webButton.Font = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Bold)
$webButton.Add_Click({ Start-PublishedUi })
$script:form.Controls.Add($webButton)

$script:activityLabel = New-Label 'COMPROBANDO TU PC...' 34 461 480 24 8 ([Drawing.FontStyle]::Bold) ([Drawing.Color]::FromArgb(105, 105, 105))
$script:form.Controls.Add($script:activityLabel)
$helpLink = New-Object System.Windows.Forms.LinkLabel
$helpLink.Text = 'INSTALAR OLLAMA'
$helpLink.Location = New-Object Drawing.Point(595, 461)
$helpLink.Size = New-Object Drawing.Size(131, 24)
$helpLink.TextAlign = [Drawing.ContentAlignment]::MiddleRight
$helpLink.LinkColor = [Drawing.Color]::FromArgb(118, 72, 255)
$helpLink.Font = New-Object Drawing.Font('Segoe UI', 8, [Drawing.FontStyle]::Bold)
$helpLink.Add_LinkClicked({ Open-Url 'https://ollama.com/download/windows' })
$script:form.Controls.Add($helpLink)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({ Update-LauncherStatus })
$script:form.Add_Shown({
  Update-LauncherStatus
  $timer.Start()
  if ($script:autoOpenLocal) { Start-LocalUi }
})
$script:form.Add_FormClosed({ $timer.Stop(); $timer.Dispose() })

[void][System.Windows.Forms.Application]::Run($script:form)
