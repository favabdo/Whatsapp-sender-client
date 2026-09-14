Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
appExe = dir & "\WhatsApp Sender.exe"
electronExe = dir & "\node_modules\electron\dist\electron.exe"
indexHtml = dir & "\frontend\dist\index.html"

If Not fso.FileExists(indexHtml) Then
  sh.Run "cmd /c npm run build", 1, True
End If

sh.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %a /F /T >nul 2>&1", 0, True
sh.Run "cmd /c taskkill /IM chromedriver.exe /F /T >nul 2>&1", 0, True

If fso.FileExists(appExe) Then
  sh.Run """" & appExe & """", 1, False
  WScript.Quit 0
End If

If fso.FileExists(electronExe) Then
  sh.Run """" & electronExe & """ """ & dir & """", 1, False
  WScript.Quit 0
End If

MsgBox "Electron is missing. Run: npm install", 16, "WhatsApp Sender"
WScript.Quit 1
