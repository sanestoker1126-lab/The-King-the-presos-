@echo off
chcp 65001 >nul
title Legend of Presos - Iniciar juego
cd /d "%~dp0"
if not exist "%~dp0index.html" (
 echo Faltan archivos. Extrae todo el ZIP antes de iniciar.
 pause
 exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
