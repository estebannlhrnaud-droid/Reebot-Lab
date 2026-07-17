@echo off
title REEBOT LOCAL AGENT
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0telemetry-server.ps1"
pause
