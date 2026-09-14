@echo off
cd /d "%~dp0"
if exist "%~dp0WhatsApp Sender.exe" (
  start "" "%~dp0WhatsApp Sender.exe"
  exit /b 0
)
if not exist "frontend\dist\index.html" (
  call npm run build
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
