@echo off
title AutoParts Pro - Store System
echo ===================================================
echo     AutoParts Pro - Multi-Floor Store Manager
echo ===================================================
cd /d "%~dp0"
echo Starting local store server...
echo.

:: Check if server is already running on port 8080
powershell -NoProfile -Command "try { `$r = Invoke-WebRequest -Uri 'http://localhost:8080/' -TimeoutSec 1 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting local store server...
    start powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
    :: Give server 1 second to bind
    ping 127.0.0.1 -n 2 >nul
) else (
    echo Local store server is already running.
)

echo Opening AutoParts Pro interface...

:: Check Brave (User's browser)
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

if exist "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    start "" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Check Edge (Program Files x86)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Check Edge (Program Files)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Check Chrome (Program Files)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Check Chrome (Program Files x86)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Check Chrome (Local AppData)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app=http://localhost:8080/index.html
    exit /b 0
)

:: Fallback to where command
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    start msedge --app=http://localhost:8080/index.html
    exit /b 0
)

where chrome >nul 2>nul
if %errorlevel% equ 0 (
    start chrome --app=http://localhost:8080/index.html
    exit /b 0
)

:: Default browser fallback
start "" "http://localhost:8080/index.html"
exit /b 0

