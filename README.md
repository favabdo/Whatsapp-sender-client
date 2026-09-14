# WhatsApp Sender — Client releases

This repository hosts **client builds** for auto-update.

Do **not** commit `node_modules` or `electron.exe` into git (GitHub 100MB limit).

## How updates work
1. Build a client ZIP from the source project:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\publish_client_release.ps1 -Version 1.0.1
   ```
2. Create a GitHub Release here with tag `v1.0.1`
3. Upload `WhatsApp-Sender-Client-v1.0.1.zip` as the release asset
4. Running clients detect the new tag and offer **Update now**

Source code lives in: https://github.com/favabdo/Whatsapp-sender-
