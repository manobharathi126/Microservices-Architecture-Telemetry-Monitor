@echo off
title PulseTrace Telemetry Monitor
setlocal EnableDelayedExpansion

:: Ensure script runs from its own directory
cd /d "%~dp0"

echo ==============================================================
echo           PulseTrace Telemetry Monitor - Starting
echo ==============================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

:: 2. Verify NPM is installed
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] NPM is not installed or not in your PATH.
    echo.
    pause
    exit /b 1
)

:: 3. Check and install root dependencies if node_modules is missing
if not exist "%~dp0node_modules" (
    echo [*] Frontend dependencies not found. Installing...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed for the root project.
        pause
        exit /b 1
    )
)

:: 4. Check and install collector dependencies if node_modules is missing
if not exist "%~dp0server\collector\node_modules" (
    echo [*] Collector dependencies not found. Installing...
    cd /d "%~dp0server\collector"
    call npm install
    cd /d "%~dp0"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed for the collector service.
        pause
        exit /b 1
    )
)

echo [*] Launching Backend Collector Service (WebSocket port 6001)...
start "PulseTrace - Backend Collector" /d "%~dp0server\collector" cmd /k "echo PulseTrace Backend Collector Service && echo ===================================== && node index.js"

echo [*] Launching Frontend Dashboard (Vite)...
start "PulseTrace - Frontend Dashboard" /d "%~dp0" cmd /k "echo PulseTrace Frontend Dashboard && echo ===================================== && npm run dev"

echo [*] Waiting for services to initialize...
timeout /t 3 /nobreak >nul 2>&1 || ping 127.0.0.1 -n 4 >nul

echo [*] Opening application in default web browser...
start http://localhost:5173

echo.
echo ==============================================================
echo           PulseTrace Services Successfully Started!
echo ==============================================================
echo  [+] Frontend URL:       http://localhost:5173
echo  [+] Collector Service:  ws://localhost:6001
echo.
echo  The services are running in their separate console windows.
echo  To shut down services at any time, run stop.bat or close
echo  their respective windows.
echo ==============================================================
echo.
pause
