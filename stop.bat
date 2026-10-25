@echo off
title Stop TelemetryOps Services
setlocal EnableDelayedExpansion

echo ==============================================================
echo              Stopping TelemetryOps Services
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

echo [*] Stopping authentication service (port 5000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] All TelemetryOps services stopped.
echo ==============================================================
timeout /t 2 >nul 2>&1
