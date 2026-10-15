@echo off
title Stop PulseTrace Services
setlocal EnableDelayedExpansion

echo ==============================================================
echo              Stopping PulseTrace Services
echo ==============================================================
echo.

echo [*] Stopping frontend dev server (port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [*] Stopping collector service (port 6001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :6001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] All PulseTrace services stopped.
echo ==============================================================
timeout /t 2 >nul 2>&1
