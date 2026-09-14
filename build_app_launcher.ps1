#Requires -Version 5.1
<#
  يبني WhatsApp Sender.exe خفيف (C# WinForms) بأيقونة البرنامج.
  مش PyInstaller — عشان Defender ما يعتبروش فيروس بالغلط.
#>
param(
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) { $OutDir = $Root }

$src = Join-Path $Root "launcher_winforms.cs"
$icon = Join-Path $Root "assets\app_icon.ico"
if (-not (Test-Path $icon)) { $icon = Join-Path $OutDir "assets\app_icon.ico" }
$outExe = Join-Path $OutDir "WhatsApp Sender.exe"

if (-not (Test-Path $src)) { throw "launcher_winforms.cs missing" }
if (-not (Test-Path $icon)) { throw "app_icon.ico missing" }

$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $csc) {
  $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4*\csc.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $csc) { throw "csc.exe not found (needs .NET Framework 4.x)" }

Write-Host "Compiling with: $csc"
& $csc /nologo /target:winexe /optimize+ /platform:anycpu `
  /reference:System.dll `
  /reference:System.Windows.Forms.dll `
  /reference:System.Drawing.dll `
  /win32icon:"$icon" `
  /out:"$outExe" `
  "$src"
if ($LASTEXITCODE -ne 0) { throw "csc failed" }

Write-Host "Built: $outExe"
Get-Item $outExe | Format-List FullName, Length, LastWriteTime
