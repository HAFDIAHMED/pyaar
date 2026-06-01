@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PYAAR - Hidden Hearts

echo(
echo   ============================================
echo      PYAAR - Hidden Hearts
echo   ============================================
echo(

REM --- check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed.
  echo   Install Node 20+ from https://nodejs.org then run this again.
  echo(
  pause
  exit /b 1
)

REM --- install dependencies on first run ---
if not exist "node_modules" (
  echo   First run: installing dependencies ^(needs internet, ~30s^)...
  echo(
  call npm install
  if errorlevel 1 (
    echo   Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

REM --- choose a port ---
set "PORT=8080"
set /p "PORT=  Enter a port [default 8080]: "
if "%PORT%"=="" set "PORT=8080"

echo(
echo   Starting on http://localhost:%PORT%
echo   Keep this window open while playing. Close it to stop the server.
echo(

REM --- open the browser, then start the server ---
start "" "http://localhost:%PORT%"
set "PORT=%PORT%"
node server\src\index.js

echo(
echo   Server stopped.
pause
