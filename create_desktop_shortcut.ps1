$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceRoot = $root
# لو اتنسخ السكربت جوه مجلد الكلاينت، ابنِ من مشروع السورس لو موجود
$maybeSource = Join-Path (Split-Path -Parent $root) "WhatsApp Sender"
if (Test-Path (Join-Path $maybeSource "build_app_launcher.ps1")) {
  $sourceRoot = $maybeSource
}

$appExe = Join-Path $root "WhatsApp Sender.exe"
$icon = Join-Path $root "assets\WhatsAppSender_desktop_v2.ico"
if (-not (Test-Path $icon)) { $icon = Join-Path $root "assets\app_icon.ico" }
$desktop = [Environment]::GetFolderPath("Desktop")
$desktopLnk = Join-Path $desktop "WhatsApp Sender.lnk"

# ابنِ EXE حقيقي بأيقونة البرنامج (مش shortcut)
$build = Join-Path $sourceRoot "build_app_launcher.ps1"
if (Test-Path $build) {
  & powershell -ExecutionPolicy Bypass -File $build -OutDir $root
} elseif (-not (Test-Path $appExe)) {
  Write-Error "WhatsApp Sender.exe missing and build_app_launcher.ps1 not found"
}

if (-not (Test-Path $appExe)) {
  Write-Error "WhatsApp Sender.exe was not created"
}

# امسح أي shortcut قديم جوه فولدر البرنامج
$oldLnk = Join-Path $root "WhatsApp Sender.lnk"
if (Test-Path $oldLnk) { Remove-Item -LiteralPath $oldLnk -Force -ErrorAction SilentlyContinue }

# اختصار الديسكتوب → الـ EXE الحقيقي
Get-ChildItem $desktop -Filter "*WhatsApp*Sender*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($desktopLnk)
$shortcut.TargetPath = $appExe
$shortcut.Arguments = ""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$appExe,0"
$shortcut.Description = "WhatsApp Sender"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "App EXE: $appExe"
Write-Host "Desktop: $desktopLnk"
ie4uinit.exe -show 2>$null
