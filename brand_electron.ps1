#Requires -Version 5.1
# يضبط أيقونة واسم electron.exe لنسخة العميل
param(
  [Parameter(Mandatory = $true)]
  [string]$ClientRoot
)

$ErrorActionPreference = "Stop"
$electronExe = Join-Path $ClientRoot "node_modules\electron\dist\electron.exe"
$icon = Join-Path $ClientRoot "assets\app_icon.ico"
if (-not (Test-Path $electronExe)) { throw "electron.exe missing: $electronExe" }
if (-not (Test-Path $icon)) { throw "icon missing: $icon" }

Write-Host "Branding electron.exe with WhatsApp Sender icon/name..."
Push-Location $ClientRoot
try {
  npm install --no-save --no-audit --no-fund rcedit@5.0.2
  if ($LASTEXITCODE -ne 0) { throw "rcedit npm install failed" }

  $bin = Join-Path $ClientRoot "node_modules\rcedit\bin\rcedit.exe"
  if (-not (Test-Path $bin)) {
    $bin = Get-ChildItem (Join-Path $ClientRoot "node_modules\rcedit") -Recurse -Filter "rcedit.exe" |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $bin -or -not (Test-Path $bin)) { throw "rcedit.exe binary missing" }

  & $bin $electronExe `
    --set-icon $icon `
    --set-version-string "FileDescription" "WhatsApp Sender" `
    --set-version-string "ProductName" "WhatsApp Sender" `
    --set-version-string "InternalName" "WhatsAppSender" `
    --set-version-string "OriginalFilename" "WhatsApp Sender.exe" `
    --set-version-string "CompanyName" "Nile Techno"
  if ($LASTEXITCODE -ne 0) { throw "rcedit failed with code $LASTEXITCODE" }
  Write-Host "OK branded electron.exe"
  # مهم: متعدلش WhatsApp Sender.exe بـ rcedit — بيكسر أرشيف PyInstaller
}
finally {
  Pop-Location
}
