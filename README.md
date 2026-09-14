# WhatsApp Sender — Client (runnable)

Repo for client builds linked by every installed copy.

## First run after clone / download
1. Install [Google Chrome](https://www.google.com/chrome/)
2. Install [ODBC Driver 17/18 for SQL Server](https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server)
3. In this folder run:
   ```bat
   npm install --omit=dev
   ```
4. Start with `WhatsApp Sender.exe` or `Start WhatsApp Sender.bat`

`node_modules` is not in git (electron.exe > 100MB). Everything else needed to run is in this repo.

## Auto-update
- Each client ships with `update-config.json` pointing here:
  - owner: `favabdo`
  - repo: `Whatsapp-sender-client`
  - branch: `main`
- On startup the app reads remote `update-config.json`. If `version` is newer, it shows the update screen and downloads this branch (or a Release ZIP if present).
- Settings → App Updates shows the linked repo and a Check for updates button.

## Publishing a new client version (from source project)
1. Bump `version` in source `update-config.json`
2. Run `pack_client.ps1` (or sync into this folder)
3. Commit and push this client repo
4. Running clients will see the new version and offer Update now
