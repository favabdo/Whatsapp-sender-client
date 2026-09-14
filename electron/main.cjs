const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn, execSync } = require('child_process')
const http = require('http')
const {
  checkForUpdate,
  applyUpdate,
  loadConfig,
  saveConfig,
} = require('./updater.cjs')

// اسم التطبيق في شريط المهام / Alt-Tab (ويندوز)
app.setName('WhatsApp Sender')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.niletechno.whatsappsender')
}

let mainWindow = null
let pythonProcess = null
const ROOT = path.join(__dirname, '..')
const API_PORT = 8787
const isDev =
  process.env.ELECTRON_DEV === '1' || process.argv.includes('--dev')

ipcMain.handle('update:getConfig', async () => {
  try {
    const cfg = loadConfig(ROOT)
    return {
      ok: true,
      version: cfg.version,
      githubOwner: cfg.githubOwner,
      githubRepo: cfg.githubRepo,
      branch: cfg.branch || 'main',
      repoUrl: `https://github.com/${cfg.githubOwner}/${cfg.githubRepo}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('update:saveConfig', async (_event, payload) => {
  try {
    const cfg = saveConfig(ROOT, {
      githubOwner: payload?.githubOwner,
      githubRepo: payload?.githubRepo,
      branch: payload?.branch,
      // version is controlled by releases/repo — don't let UI downgrade casually
      version: loadConfig(ROOT).version,
    })
    return {
      ok: true,
      version: cfg.version,
      githubOwner: cfg.githubOwner,
      githubRepo: cfg.githubRepo,
      branch: cfg.branch || 'main',
      repoUrl: `https://github.com/${cfg.githubOwner}/${cfg.githubRepo}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('update:check', async () => {
  try {
    return await checkForUpdate(ROOT)
  } catch (err) {
    return {
      updateAvailable: false,
      reason: 'check_failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('update:apply', async (event) => {
  try {
    const result = await applyUpdate(ROOT, (progress) => {
      try {
        event.sender.send('update:progress', progress)
      } catch (_) {
        /* ignore */
      }
    })
    if (result.ok) {
      // أعد تشغيل التطبيق بعد التحديث
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 600)
    }
    return result
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

function killPort(port) {
  if (process.platform !== 'win32') return
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      windowsHide: true,
    })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true, stdio: 'ignore' })
      } catch (_) {
        /* ignore */
      }
    }
  } catch (_) {
    /* nothing listening */
  }
}

function killChromeDriver() {
  if (process.platform !== 'win32') return
  try {
    execSync('taskkill /IM chromedriver.exe /F /T', {
      windowsHide: true,
      stdio: 'ignore',
    })
  } catch (_) {
    /* ignore */
  }
}

function waitForApi(timeoutMs = 90000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${API_PORT}/health`, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          resolve(true)
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(1500, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('API did not start in time'))
        return
      }
      setTimeout(tick, 400)
    }
    tick()
  })
}

async function startPythonApi() {
  // مهم: اقتل أي API قديم على نفس البورت عشان التعديلات الجديدة تتحمّل
  killPort(API_PORT)
  killChromeDriver()

  const apiExe = path.join(ROOT, 'WhatsAppSenderAPI.exe')
  const apiDirExe = path.join(ROOT, 'WhatsAppSenderAPI', 'WhatsAppSenderAPI.exe')

  if (fs.existsSync(apiExe)) {
    pythonProcess = spawn(apiExe, [], {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else if (fs.existsSync(apiDirExe)) {
    pythonProcess = spawn(apiDirExe, [], {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else {
    const pythonCmd = process.env.WHATSAPP_SENDER_PYTHON || 'python'
    const script = path.join(ROOT, 'api.py')
    pythonProcess = spawn(pythonCmd, [script], {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  pythonProcess.stdout.on('data', (buf) => {
    console.log(`[api] ${buf.toString().trim()}`)
  })
  pythonProcess.stderr.on('data', (buf) => {
    console.error(`[api] ${buf.toString().trim()}`)
  })
  pythonProcess.on('exit', () => {
    pythonProcess = null
  })
}

function stopPythonApi() {
  if (pythonProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      } else {
        pythonProcess.kill('SIGTERM')
      }
    } catch (_) {
      /* ignore */
    }
    pythonProcess = null
  }
  killPort(API_PORT)
  killChromeDriver()
}

async function createWindow() {
  const iconPathIco = path.join(ROOT, 'assets', 'app_icon.ico')
  const iconPathPng = path.join(ROOT, 'assets', 'app_icon.png')
  const winOpts = {
    width: 1180,
    height: 720,
    minWidth: 360,
    minHeight: 520,
    title: 'WhatsApp Sender',
    backgroundColor: '#F3F4F6',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  }
  if (fs.existsSync(iconPathIco)) {
    winOpts.icon = iconPathIco
  } else if (fs.existsSync(iconPathPng)) {
    winOpts.icon = iconPathPng
  }

  mainWindow = new BrowserWindow(winOpts)
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.setTitle('WhatsApp Sender')
    mainWindow.show()
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    const indexHtml = path.join(ROOT, 'frontend', 'dist', 'index.html')
    if (!fs.existsSync(indexHtml)) {
      throw new Error('frontend/dist missing. Run: npm run build')
    }
    await mainWindow.loadFile(indexHtml)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await startPythonApi()
  try {
    await waitForApi()
  } catch (err) {
    console.error(err)
  }
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopPythonApi()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopPythonApi()
})
