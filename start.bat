@echo off
title Nuvio Live Sports Plugin

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b
)

echo [Nuvio] Installing dependencies if needed...
call npm install

echo.
echo [Nuvio] Starting the server...
call npm start

pause
