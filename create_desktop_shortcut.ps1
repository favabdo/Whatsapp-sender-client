$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root "WhatsApp Sender.exe"
# ICO متعدد المقاسات (اسم جديد لكسر كاش ويندوز)
$icon = Join-Path $root "assets\WhatsAppSender_desktop_v2.ico"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "WhatsApp Sender.lnk"

if (-not (Test-Path $exe)) {
  Write-Error "WhatsApp Sender.exe not found."
}
if (-not (Test-Path $icon)) {
  Write-Error "Multi-size ICO not found: $icon"
}

# امسح أي اختصارات قديمة بنفس الاسم
Get-ChildItem $desktop -Filter "*WhatsApp*Sender*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $root
# مهم: مسار ملف الـ ICO نفسه عشان ويندوز يختار المقاس المناسب (16..256)
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = "WhatsApp Sender"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "Shortcut: $lnkPath"
Write-Host "Icon ICO: $icon"

# Soft refresh
ie4uinit.exe -show 2>$null
