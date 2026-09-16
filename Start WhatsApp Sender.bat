@echo off
cd /d "%~dp0"

REM Real app EXE in this folder (branded Electron copy)
if exist "%~dp0WhatsApp Sender.exe" (
  if not exist "%~dp0frontend\dist\index.html" (
    call npm run build
  )
  start "" "%~dp0WhatsApp Sender.exe"
  exit /b 0
)

REM Electron runtime: check multiple locations (npm install or bundled portable)
set "ELECTRON_EXE="
if exist "%~dp0node_modules\electron\dist\electron.exe" set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not defined ELECTRON_EXE if exist "%~dp0_internal\electron\dist\electron.exe" set "ELECTRON_EXE=%~dp0_internal\electron\dist\electron.exe"
if not defined ELECTRON_EXE if exist "%~dp0electron_runtime.exe" set "ELECTRON_EXE=%~dp0electron_runtime.exe"
if not defined ELECTRON_EXE if exist "%~dp0electron.exe" set "ELECTRON_EXE=%~dp0electron.exe"

if defined ELECTRON_EXE (
  if not exist "%~dp0frontend\dist\index.html" (
    call npm run build
  )
  start "" "%ELECTRON_EXE%" "%~dp0"
  exit /b 0
)

echo Electron is missing. Re-download the full client package.
pause
exit /b 1
