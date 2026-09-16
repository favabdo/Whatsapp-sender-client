#Requires -Version 5.1
<#
  يبني حزم portable WhatsApp Sender — فولدر واحد يحتوي كل حاجة يشتغل من غير ما يحتاج
  internet أو npm install أو أي أداة إضافية.

  الاستخدام:
    .\build-portable.ps1 -OutDir "D:\portable"
    .\build-portable.ps1 -OutDir "D:\portable" -Zip

  الناتج: فولدر (أو ZIP) يحتوي:
    WhatsApp Sender.exe   <- launcher C# WinForms (مُ rebuilding لو تغير)
    node_modules\electron\dist\electron.exe
    frontend\dist\...
    electron\...
    _internal\...   (Python runtime)
    WhatsAppSenderAPI.exe
    assets\...
    secure\users.key
    package.json, update-config.json
    Start WhatsApp Sender.bat
  #>
param(
  [string]$OutDir = "",
  [switch]$Zip
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
# Default output goes OUTSIDE the source tree so Copy-Tree doesn't recurse into itself.
if (-not $OutDir) {
  $parent = Split-Path -Parent $Root
  $OutDir = Join-Path $parent "WhatsAppSender-portable"
}

Write-Host "Building portable package..." -ForegroundColor Cyan

# 1) Ensure the launcher EXE is fresh
$buildLauncher = Join-Path $Root "build_app_launcher.ps1"
if (Test-Path $buildLauncher) {
  Write-Host "Building launcher..." -ForegroundColor Yellow
  & powershell -ExecutionPolicy Bypass -File $buildLauncher -OutDir $Root
  if ($LASTEXITCODE -ne 0) { throw "launcher build failed" }
}

# 2) Clean output
if (Test-Path $OutDir) {
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# 3) Copy everything needed (exclude runtime-only dirs)
$exclude = @(
  'node_modules\.cache',
  'node_modules\electron\dist\locales',
  'wa_chrome_profile',
  'uploads',
  'output.log',
  '_update_tmp',
  '.git',
  'secure\settings.key',
  'secure\sql_settings.bin'
)

function Copy-Tree($src, $dst) {
  if (-not (Test-Path $src)) { return }
  if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
  foreach ($item in Get-ChildItem -LiteralPath $src -Force) {
    $rel = $item.FullName.Substring($src.Length).TrimStart('\')
    $dstPath = Join-Path $dst $rel
    # skip excluded paths
    $skip = $false
    foreach ($pat in $exclude) {
      if ($rel -eq $pat -or $rel.StartsWith($pat + '\')) { $skip = $true; break }
    }
    if ($skip) { continue }
    if ($item.PSIsContainer) {
      Copy-Tree $item.FullName $dstPath
    } else {
      $null = New-Item -ItemType Directory -Path (Split-Path $dstPath -Parent) -Force -ErrorAction SilentlyContinue
      Copy-Item -LiteralPath $item.FullName -Destination $dstPath -Force
    }
  }
}

Write-Host "Copying files..." -ForegroundColor Yellow
Copy-Tree $Root $OutDir

# 4) Verify critical files exist
$checks = @(
  "WhatsApp Sender.exe",
  "WhatsAppSenderAPI.exe",
  "node_modules\electron\dist\electron.exe",
  "frontend\dist\index.html",
  "electron\main.cjs",
  "secure\users.key",
  "package.json",
  "update-config.json",
  "Start WhatsApp Sender.bat"
)
$missing = foreach ($c in $checks) {
  if (-not (Test-Path (Join-Path $OutDir $c))) { $c }
}
if ($missing) {
  throw "Missing from package: $($missing -join ', ')"
}

# 5) Remove the source build scripts from the package (not needed at runtime)
Remove-Item -LiteralPath (Join-Path $OutDir "build_app_launcher.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "build-portable.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "brand_electron.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "create_desktop_shortcut.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "launcher_winforms.cs") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "start_silent.vbs") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "package-lock.json") -Force -ErrorAction SilentlyContinue

# 6) Create ZIP (single downloadable file) using Python
$zipName = "WhatsAppSender.zip"
$zipPath = Join-Path $Root $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$pyScript = Join-Path $Root "zip-create.py"
$py = "C:\Users\abdal\AppData\Local\Microsoft\WindowsApps\python3"
if (-not (Test-Path $py)) { $py = "python" }
& $py $pyScript $OutDir $zipPath
if ($LASTEXITCODE -ne 0) { throw "Python zip failed" }
Remove-Item -LiteralPath $OutDir -Recurse -Force
Write-Host "ZIP created: $zipPath" -ForegroundColor Green
(Get-Item $zipPath).Length | Format-Table @{Label='Size'; Expression={"{0:N2} MB" -or $_.Length/1MB}}

# 7) Create run-from-zip launcher (extracts on first run, then runs)
$launcherBat = Join-Path $Root "run-portable.bat"
@(
  "@echo off",
  "set DIR=%~dp0",
  "if exist ""%DIR%Start WhatsApp Sender.bat"" goto :run",
  "echo Extracting portable package...",
  "powershell -Command ""Expand-Archive -LiteralPath '%DIR%WhatsAppSender.zip' -DestinationPath '%DIR' -Force""",
  "timeout /t 2 /nobreak ^>nul",
  ":run",
  "start """" ""%DIR%Start WhatsApp Sender.bat"""
) | Set-Content $launcherBat -Encoding ASCII

Write-Host "Launcher: $launcherBat" -ForegroundColor Green
Write-Host "Done." -ForegroundColor Green