@echo off
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%use-mock-data.ps1" -Force
if errorlevel 1 pause
