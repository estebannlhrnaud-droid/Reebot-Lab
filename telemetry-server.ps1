$ErrorActionPreference = 'SilentlyContinue'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:47831/')
$listener.Start()
$disk=Get-Disk -Number 1
$part=Get-Partition -DiskNumber 1 | Where-Object DriveLetter | Select-Object -First 1
$diskLabel="Disco 1 - $($disk.FriendlyName) ($($part.DriveLetter):)"
$osStatic=Get-CimInstance Win32_OperatingSystem
$totalMemoryBytes=[double]$osStatic.TotalVisibleMemorySize*1KB
$volStatic=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($part.DriveLetter):'"
Write-Host 'REEBOT LAB conectado en http://127.0.0.1:47831'
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin','*')
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  if ($ctx.Request.Url.AbsolutePath -eq '/metrics') {
    $cpu=[double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
    $available=[double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableBytes
    $mem=[math]::Round((1-$available/$totalMemoryBytes)*100,1)
    $perf=Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object {$_.Name -match '^1( |$)'} | Select-Object -First 1
    $gpuRaw=& nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>$null
    $gpuValues=if($gpuRaw){@(($gpuRaw -split ',')|ForEach-Object{[double]($_.Trim())})}else{@(0,0,0,0)}
    $gpuLoad=if($gpuValues.Count -ge 1){$gpuValues[0]}else{0}
    $vramUsedMb=if($gpuValues.Count -ge 2){$gpuValues[1]}else{0}
    $vramTotalMb=if($gpuValues.Count -ge 3){$gpuValues[2]}else{0}
    $gpuTemperature=if($gpuValues.Count -ge 4){$gpuValues[3]}else{0}
    $vramPercent=if($vramTotalMb -gt 0){[math]::Round($vramUsedMb/$vramTotalMb*100,1)}else{0}
    $procs=Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10
    $data=[ordered]@{cpu=[math]::Round($cpu,1);memory=$mem;gpu=[math]::Round($gpuLoad,1);gpuTemp=[math]::Round($gpuTemperature,1);vram=$vramPercent;vramUsed=[math]::Round($vramUsedMb/1024,1);vramTotal=[math]::Round($vramTotalMb/1024,1);disk=if($perf){[math]::Min(100,[double]$perf.PercentDiskTime)}else{0};read=if($perf){[math]::Round($perf.DiskReadBytesPerSec/1MB,1)}else{0};write=if($perf){[math]::Round($perf.DiskWriteBytesPerSec/1MB,1)}else{0};time=(Get-Date).ToString('HH:mm:ss');uptime=((Get-Date)-$osStatic.LastBootUpTime).ToString('d\d\ h\h\ m\m');memoryUsed=[math]::Round(($totalMemoryBytes-$available)/1GB,1);memoryTotal=[math]::Round($totalMemoryBytes/1GB,1);diskName=$diskLabel;diskFree=if($volStatic){[math]::Round($volStatic.FreeSpace/1GB,1)}else{0};processes=@($procs|ForEach-Object{[ordered]@{name=$_.ProcessName;pid=[int]$_.Id;cpu=0;ram=[math]::Round([double]$_.WorkingSet64/1MB,1)}})}
    $json=$data|ConvertTo-Json -Depth 4 -Compress
  } else {$json='{"status":"REEBOT LAB activo"}'}
  $bytes=[Text.Encoding]::UTF8.GetBytes($json);$ctx.Response.ContentLength64=$bytes.Length;$ctx.Response.OutputStream.Write($bytes,0,$bytes.Length);$ctx.Response.Close()
}
