@echo off
title REEBOT IA LOCAL - qwen3.5:9b
color 0B
echo.
echo   REEBOT IA LOCAL
echo   Modelo: qwen3.5:9b
echo   Escribe /bye para salir.
echo.
powershell.exe -NoProfile -Command "try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo   El servidor esta apagado. Intentando iniciar Ollama...
  start "REEBOT OLLAMA SERVER" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
  timeout /t 4 /nobreak >nul
)
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" run qwen3.5:9b
if errorlevel 1 (
  echo.
  echo No se pudo conectar con Ollama. REEBOT LAB puede seguir funcionando en modo de analisis basico.
  pause
)
