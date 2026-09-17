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

if exist "%~dp0node_modules\electron\dist\electron.exe" (
  if not exist "%~dp0frontend\dist\index.html" (
    call npm run build
  )
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
  exit /b 0
)

echo Electron is missing. Run: npm install
pause
exit /b 1
