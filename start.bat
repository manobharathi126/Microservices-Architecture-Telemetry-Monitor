@echo off
title TelemetryOps Monitor - Startup Manager
cd /d "%~dp0"

echo ==============================================================
echo           TelemetryOps Monitoring Platform - Starting
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

:: 3. Check and install frontend dependencies if missing
if not exist "%~dp0node_modules\" (
    echo [*] Frontend dependencies not found. Installing...
    call npm install
)

:: 4. Check and install collector dependencies if missing
if not exist "%~dp0server\collector\node_modules\" (
    echo [*] Collector dependencies not found. Installing...
    cd /d "%~dp0server\collector"
    call npm install
    cd /d "%~dp0"
)

:: 5. Check and install auth-service dependencies if missing
if not exist "%~dp0server\auth-service\node_modules\" (
    echo [*] Authentication service dependencies not found. Installing...
    cd /d "%~dp0server\auth-service"
    call npm install
    cd /d "%~dp0"
)

echo.
echo [*] Launching Service 1: Authentication Service on Port 5000...
start "TelemetryOps - Authentication Service" /d "%~dp0server\auth-service" cmd /k "echo TelemetryOps Authentication Service - Port 5000 && echo ================================================ && npm run dev"

echo [*] Launching Service 2: Telemetry Collector on Port 6001...
start "TelemetryOps - Telemetry Collector" /d "%~dp0server\collector" cmd /k "echo TelemetryOps Telemetry Collector - Port 6001 && echo ================================================ && node index.js"

echo [*] Launching Service 3: Frontend Dashboard on Port 5173...
start "TelemetryOps - Frontend Dashboard" /d "%~dp0" cmd /k "echo TelemetryOps Frontend Dashboard - Port 5173 && echo ================================================ && npm run dev"

echo.
echo [*] Waiting for services to initialize...
timeout /t 3 /nobreak >nul 2>&1

echo [*] Opening application in default web browser...
start http://localhost:5173

echo.
echo ==============================================================
echo           TelemetryOps Services Successfully Started!
echo ==============================================================
echo  [+] Frontend URL:          http://localhost:5173
echo  [+] Auth Service API:      http://localhost:5000
echo  [+] Collector Service:     ws://localhost:6001
echo.
echo  Each service is running in its own separate console window:
echo   - Window 1: TelemetryOps - Authentication Service
echo   - Window 2: TelemetryOps - Telemetry Collector
echo   - Window 3: TelemetryOps - Frontend Dashboard
echo.
echo  To shut down all services at any time, run stop.bat or close
echo  their respective console windows.
echo ==============================================================
echo.
pause
