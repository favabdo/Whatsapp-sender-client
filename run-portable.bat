@echo off
set DIR=%~dp0
if exist "%DIR%Start WhatsApp Sender.bat" goto :run
echo Extracting portable package...
powershell -Command "Expand-Archive -LiteralPath '%DIR%WhatsAppSender.zip' -DestinationPath '%DIR' -Force"
timeout /t 2 /nobreak ^>nul
:run
start "" "%DIR%Start WhatsApp Sender.bat"
