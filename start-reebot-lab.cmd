@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo REEBOT LAB necesita Node.js 22.13 o superior.
  pause
  exit /b 1
)
if not exist "%~dp0node_modules" (
  echo Instala las dependencias primero con: npm install
  pause
  exit /b 1
)
start "REEBOT LAB Telemetry" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0telemetry-server.ps1"
start "REEBOT LAB UI" /min cmd.exe /c "cd /d "%~dp0" && npm run dev"
timeout /t 5 /nobreak >nul
start "" http://localhost:3000
endlocal
