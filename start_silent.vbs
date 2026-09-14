Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
exeLauncher = dir & "\WhatsApp Sender.exe"

' لو الـ EXE موجود شغّله (أيقونة البرنامج)، وإلا Electron مباشرة
If fso.FileExists(exeLauncher) Then
  sh.Run """" & exeLauncher & """", 1, False
  WScript.Quit 0
End If

electronExe = dir & "\node_modules\electron\dist\electron.exe"
indexHtml = dir & "\frontend\dist\index.html"

If Not fso.FileExists(electronExe) Then
  MsgBox "Electron is missing. Run: npm install", 16, "Whatsapp Sender"
  WScript.Quit 1
End If

If Not fso.FileExists(indexHtml) Then
  sh.Run "cmd /c npm run build", 1, True
End If

If Not fso.FileExists(indexHtml) Then
  MsgBox "UI build failed. Run: npm run build", 16, "Whatsapp Sender"
  WScript.Quit 1
End If

sh.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %a /F /T >nul 2>&1", 0, True
sh.Run "cmd /c taskkill /IM chromedriver.exe /F /T >nul 2>&1", 0, True

sh.Run """" & electronExe & """ """ & dir & """", 1, False
