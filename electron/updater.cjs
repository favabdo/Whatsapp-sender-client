const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { execFileSync, spawn } = require('child_process')

const DEFAULT_OWNER = 'favabdo'
const DEFAULT_REPO = 'Whatsapp-sender-client'

function loadConfig(root) {
  const p = path.join(root, 'update-config.json')
  const defaults = {
    version: '1.0.0',
    githubOwner: DEFAULT_OWNER,
    githubRepo: DEFAULT_REPO,
    assetNameContains: 'WhatsApp-Sender-Client',
    githubToken: '',
    branch: 'main',
  }
  if (!fs.existsSync(p)) return { ...defaults }
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

function saveConfig(root, patch) {
  const cfg = { ...loadConfig(root), ...(patch || {}) }
  // never blank the linked repo — always keep a usable channel
  cfg.githubOwner = String(cfg.githubOwner || DEFAULT_OWNER).trim() || DEFAULT_OWNER
  cfg.githubRepo = String(cfg.githubRepo || DEFAULT_REPO).trim() || DEFAULT_REPO
  cfg.branch = String(cfg.branch || 'main').trim() || 'main'
  cfg.version = normalizeVersion(cfg.version || '0.0.0')
  const p = path.join(root, 'update-config.json')
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8')
  return cfg
}

function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a)
    .split('.')
    .map((x) => parseInt(x, 10) || 0)
  const pb = normalizeVersion(b)
    .split('.')
    .map((x) => parseInt(x, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const u = new URL(url)
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent': 'WhatsApp-Sender-Updater',
          Accept: 'application/json',
          ...headers,
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => {
          raw += c
        })
        res.on('end', () => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            httpGetJson(res.headers.location, headers).then(resolve, reject)
            return
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(e)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function githubRequest(urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: urlPath,
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WhatsApp-Sender-Updater',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => {
          raw += c
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API ${res.statusCode}: ${raw.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(e)
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function downloadFile(url, dest, token, onProgress) {
  return new Promise((resolve, reject) => {
    const doGet = (target, redirectsLeft) => {
      const lib = target.startsWith('https') ? https : http
      const u = new URL(target)
      const req = lib.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'GET',
          headers: {
            'User-Agent': 'WhatsApp-Sender-Updater',
            Accept: 'application/octet-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            doGet(res.headers.location, redirectsLeft - 1)
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Download failed (${res.statusCode})`))
            return
          }
          const total = Number(res.headers['content-length'] || 0)
          let got = 0
          const out = fs.createWriteStream(dest)
          res.on('data', (chunk) => {
            got += chunk.length
            if (onProgress && total) {
              onProgress(Math.min(99, Math.round((got / total) * 100)))
            }
          })
          res.pipe(out)
          res.on('error', reject)
          out.on('finish', () => {
            out.close(() => {
              if (total && got < total) {
                reject(new Error(`Download stopped early (${got} of ${total} bytes)`))
                return
              }
              resolve(dest)
            })
          })
          out.on('error', reject)
        },
      )
      req.on('error', reject)
      req.end()
    }
    doGet(url, 5)
  })
}

async function fetchRemoteUpdateConfig(owner, repo, branch, token) {
  const b = branch || 'main'
  // 1) raw.githubusercontent.com
  try {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/update-config.json`
    const cfg = await httpGetJson(rawUrl, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    })
    if (cfg && (cfg.version || cfg.githubRepo)) return cfg
  } catch (_) {
    /* try API */
  }
  // 2) GitHub Contents API
  const enc = encodeURIComponent(b)
  const data = await githubRequest(
    `/repos/${owner}/${repo}/contents/update-config.json?ref=${enc}`,
    token,
  )
  if (!data || !data.content) {
    throw new Error('Remote update-config.json not found on repo')
  }
  const text = Buffer.from(data.content, 'base64').toString('utf8')
  return JSON.parse(text)
}

async function checkForUpdate(root) {
  const cfg = loadConfig(root)
  const owner = String(cfg.githubOwner || DEFAULT_OWNER).trim()
  const repo = String(cfg.githubRepo || DEFAULT_REPO).trim()
  const branch = String(cfg.branch || 'main').trim() || 'main'
  const localVersion = normalizeVersion(cfg.version || '0.0.0')
  if (!owner || !repo) {
    return {
      updateAvailable: false,
      reason: 'repo_not_configured',
      localVersion,
      repoUrl: '',
    }
  }
  const token = String(cfg.githubToken || process.env.GITHUB_TOKEN || '').trim()
  const repoUrl = `https://github.com/${owner}/${repo}`

  let remoteCfg
  try {
    remoteCfg = await fetchRemoteUpdateConfig(owner, repo, branch, token)
  } catch (e) {
    return {
      updateAvailable: false,
      reason: 'remote_config_failed',
      localVersion,
      repoUrl,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const remoteVersion = normalizeVersion(remoteCfg.version || '')
  if (!remoteVersion) {
    return {
      updateAvailable: false,
      reason: 'no_remote_version',
      localVersion,
      repoUrl,
    }
  }

  const newer = compareVersions(remoteVersion, localVersion) > 0

  // A Release asset is only usable when it is the SAME build the remote
  // update-config.json advertises — otherwise a stale release would install
  // old files under a new version number.
  let assetName = null
  let assetUrl = null
  let browserDownloadUrl = null
  let releaseName = null
  let releaseUrl = null
  let downloadMode = 'zipball'
  let releaseNote = ''

  try {
    const release = await githubRequest(
      `/repos/${owner}/${repo}/releases/latest`,
      token,
    )
    const releaseVersion = normalizeVersion(release.tag_name || release.name || '')
    const needle = String(
      cfg.assetNameContains || remoteCfg.assetNameContains || 'Client',
    ).toLowerCase()
    const assets = Array.isArray(release.assets) ? release.assets : []
    const asset =
      assets.find((a) => String(a.name || '').toLowerCase().includes(needle)) ||
      assets.find((a) => String(a.name || '').toLowerCase().endsWith('.zip')) ||
      null
    if (!asset) {
      releaseNote = 'release has no usable asset'
    } else if (compareVersions(releaseVersion, remoteVersion) !== 0) {
      releaseNote = `release ${releaseVersion || '?'} != remote ${remoteVersion}`
    } else {
      assetName = asset.name
      assetUrl = asset.url || null
      browserDownloadUrl = asset.browser_download_url || null
      releaseName = release.name || release.tag_name
      releaseUrl = release.html_url
      downloadMode = 'release'
    }
  } catch (_) {
    releaseNote = 'no releases'
  }

  const zipballUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`

  return {
    updateAvailable: newer,
    localVersion,
    remoteVersion,
    repoUrl,
    branch,
    releaseName,
    releaseUrl,
    assetName,
    assetUrl,
    browserDownloadUrl,
    zipballUrl,
    downloadMode,
    releaseNote,
    notes: '',
  }
}

function psQuote(p) {
  return String(p).replace(/'/g, "''")
}

// A package missing any of these would leave the install unable to start.
const REQUIRED_BUILD_ENTRIES = [
  'WhatsApp Sender.exe',
  'WhatsAppSenderAPI.exe',
  'electron/main.cjs',
  'electron/updater.cjs',
  'frontend/dist/index.html',
  '_internal/base_library.zip',
  '_internal',
]

function buildApplyScript(root, payloadDir, version) {
  return `$ErrorActionPreference = 'Continue'
$root = '${psQuote(root)}'
$payload = '${psQuote(payloadDir)}'
$tmp = Join-Path $root '_update_tmp'
$log = Join-Path $root 'update.log'
$nextVersion = '${psQuote(normalizeVersion(version || '0.0.0'))}'

function Log($msg) { [IO.File]::AppendAllText($log, (Get-Date -Format 's') + '  ' + $msg + [Environment]::NewLine) }

function Wait-Exit($name, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Name $name -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# 1) Close the running app (its own process tree) and wait for released locks
Start-Sleep -Seconds 3
Stop-Process -Name 'WhatsAppSenderAPI' -Force -ErrorAction SilentlyContinue
Stop-Process -Name 'chromedriver' -Force -ErrorAction SilentlyContinue
Stop-Process -Name 'WhatsApp Sender' -Force -ErrorAction SilentlyContinue
$stuck = @()
foreach ($n in 'WhatsAppSenderAPI', 'chromedriver', 'WhatsApp Sender') {
  if (-not (Wait-Exit $n 20)) { $stuck += $n }
}
Log ("closed processes; stuck=" + $(if ($stuck) { $stuck -join ',' } else { 'none' }))
if ($stuck) { Log 'abort: process still holding files, nothing was changed'; exit 1 }

# 2) The payload must be a COMPLETE build before anything is replaced
$required = @(${REQUIRED_BUILD_ENTRIES.map((f) => `'${psQuote(f.split('/').join('\\'))}'`).join(', ')})
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $payload $_)) })
if ($missing.Count -gt 0) {
  Log ('abort: package incomplete, missing=' + ($missing -join ','))
  Set-Content -LiteralPath (Join-Path $root 'UPDATE_FAILED.txt') -Value ('Downloaded package is incomplete (missing: ' + ($missing -join ', ') + '). The installed version was NOT changed. Re-run the update or reinstall the full package.') -Encoding UTF8
  exit 1
}
Log 'payload verified complete'

# 3) Full rebuild of everything the package ships: each packaged folder is
#    mirrored, so files from the previous build layout are removed instead of
#    surviving next to the new ones. Folders the customer made are left alone.
$skipDirs = @('secure', 'node_modules', 'wa_chrome_profile', 'uploads', '.git', '_update_tmp')
$pkgDirs = @(Get-ChildItem -LiteralPath $payload -Directory | Where-Object { $skipDirs -notcontains $_.Name })
$copyFail = @()
foreach ($d in $pkgDirs) {
  $extra = @()
  if ($d.Name -eq '_internal') { $extra = @('/XD', 'electron') }
  robocopy (Join-Path $payload $d.Name) (Join-Path $root $d.Name) /MIR /R:20 /W:2 /NFL /NDL /NJH /NJS $extra | Out-Null
  if ($LASTEXITCODE -ge 8) { $copyFail += $d.Name }
}
Get-ChildItem -LiteralPath $payload -File | Where-Object { $_.Name -ne 'update-config.json' } | ForEach-Object {
  try { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $root $_.Name) -Force } catch { $copyFail += $_.Name }
}
# folders from obsolete build layouts
foreach ($old in 'WhatsAppSenderAPI', 'electron_runtime', 'src', 'build') {
  $p = Join-Path $root $old
  if ((Test-Path $p) -and -not (Test-Path (Join-Path $payload $old))) {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  }
}
$mirrored = ($pkgDirs | ForEach-Object { $_.Name }) -join ','
Log ('mirrored dirs = ' + $mirrored)
if ($copyFail.Count -gt 0) {
  Log ('abort: copy failed for ' + ($copyFail -join ','))
  Set-Content -LiteralPath (Join-Path $root 'UPDATE_FAILED.txt') -Value ('Some files could not be replaced (' + ($copyFail -join ', ') + '). The installed version was NOT changed. Close Chrome/WhatsApp Sender and run the update again.') -Encoding UTF8
  exit 1
}

# 4) Local data that must survive a rebuild
try {
  $dstSecure = Join-Path $root 'secure'
  if (-not (Test-Path (Join-Path $dstSecure 'users.key')) -and (Test-Path (Join-Path $payload 'secure\\users.key'))) {
    New-Item -ItemType Directory -Force -Path $dstSecure | Out-Null
    Copy-Item (Join-Path $payload 'secure\\users.key') (Join-Path $dstSecure 'users.key') -Force
    Log 'restored secure/users.key'
  }
} catch { Log ('users.key restore failed: ' + $_) }

# 5) Only now mark this build as installed
try {
  $cfgPath = Join-Path $root 'update-config.json'
  if (Test-Path $cfgPath) { $j = Get-Content $cfgPath -Raw | ConvertFrom-Json } else { $j = [pscustomobject]@{} }
  $j | Add-Member -Force -NotePropertyName version -NotePropertyValue $nextVersion
  if (-not $j.githubOwner) { $j | Add-Member -Force -NotePropertyName githubOwner -NotePropertyValue 'favabdo' }
  if (-not $j.githubRepo) { $j | Add-Member -Force -NotePropertyName githubRepo -NotePropertyValue 'Whatsapp-sender-client' }
  if (-not $j.branch) { $j | Add-Member -Force -NotePropertyName branch -NotePropertyValue 'main' }
  if (-not $j.assetNameContains) { $j | Add-Member -Force -NotePropertyName assetNameContains -NotePropertyValue 'WhatsApp-Sender-Client' }
  if ($null -eq $j.githubToken) { $j | Add-Member -Force -NotePropertyName githubToken -NotePropertyValue '' }
  [IO.File]::WriteAllText($cfgPath, ($j | ConvertTo-Json))
  Remove-Item (Join-Path $root 'UPDATE_FAILED.txt') -Force -ErrorAction SilentlyContinue
  Log ('installed ' + $nextVersion)
} catch { Log ('version stamp failed: ' + $_) }

# 6) Clean the staging area and relaunch
Remove-Item (Join-Path $tmp 'update.zip') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $tmp 'extract') -Recurse -Force -ErrorAction SilentlyContinue
$started = $false
for ($i = 0; $i -lt 4 -and -not $started; $i += 1) {
  try { Start-Process -FilePath (Join-Path $root 'WhatsApp Sender.exe') -WorkingDirectory $root -WindowStyle Hidden -ErrorAction Stop; $started = $true } catch { Start-Sleep -Seconds 3 }
}
if (-not $started) {
  try { Start-Process -FilePath (Join-Path $root 'Start WhatsApp Sender.bat') -WorkingDirectory $root -WindowStyle Hidden -ErrorAction Stop; $started = $true } catch { Log ('relaunch failed: ' + $_) }
}
Log ('relaunched=' + $started)
`;
}

// Electron runs inside a kill-on-exit job object: any child process — detached
// or not — dies with app.exit(). Creating the updater through WMI hands it to
// the WMI provider instead, so it outlives the app.
function spawnApplyScript(root) {
  const script = path.join(root, '_update_tmp', 'apply_update.ps1')
  if (!fs.existsSync(script)) return false
  const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}"`
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$r = Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList @('${psQuote(cmd)}'); $r.ReturnValue`,
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 30000 },
    )
    if (String(out).trim() === '0') return true
  } catch (_) {
    /* WMI unavailable (hardened service) — try the plain spawn anyway */
  }
  try {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        script,
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    child.unref()
    return true
  } catch (_) {
    return false
  }
}

async function stageUpdate(root, sendProgress) {
  const info = await checkForUpdate(root)
  if (!info.updateAvailable) {
    return { ok: false, error: 'No update available' }
  }
  const cfg = loadConfig(root)
  const token = String(cfg.githubToken || process.env.GITHUB_TOKEN || '').trim()
  const tmpRoot = path.join(root, '_update_tmp')
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* previous run still locked by antivirus — continue with what is deletable */
  }
  fs.mkdirSync(tmpRoot, { recursive: true })
  const zipPath = path.join(tmpRoot, 'update.zip')
  sendProgress?.({ phase: 'download', percent: 0 })

  let url = info.zipballUrl
  let useToken = false
  if (info.downloadMode === 'release' && (info.assetUrl || info.browserDownloadUrl)) {
    url = token && info.assetUrl ? info.assetUrl : info.browserDownloadUrl
    useToken = Boolean(token && info.assetUrl)
  }
  if (!url) {
    return { ok: false, error: 'No download URL for update' }
  }

  await downloadFile(url, zipPath, useToken ? token : '', (percent) => {
    sendProgress?.({ phase: 'download', percent })
  })
  sendProgress?.({ phase: 'extract', percent: 100 })
  const extractDir = path.join(tmpRoot, 'extract')
  try {
    fs.rmSync(extractDir, { recursive: true, force: true })
  } catch {
    /* locked leftovers — ExtractToDirectory creates what it can */
  }
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('${psQuote(zipPath)}', '${psQuote(extractDir)}')`,
      ],
      { windowsHide: true },
    )
  } catch (e) {
    return {
      ok: false,
      error: `Could not unpack the update (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). Nothing was changed — try again, or allow the app folder in your antivirus.`,
    }
  }

  let payloadDir = extractDir
  const kids = fs.readdirSync(extractDir)
  if (kids.length === 1) {
    const only = path.join(extractDir, kids[0])
    if (fs.statSync(only).isDirectory()) payloadDir = only
  }

  // Checked here, while the app is still open, so a broken download never
  // reaches the point of no return.
  const missing = REQUIRED_BUILD_ENTRIES.filter(
    (f) => !fs.existsSync(path.join(payloadDir, f)),
  )
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Downloaded package is incomplete (missing: ${missing.join(', ')}). Nothing was changed — try again, or allow the app folder in your antivirus.`,
    }
  }

  // Never install a package that is not the version the channel advertises:
  // doing so left customers with old build files under a new version number.
  let payloadVersion = ''
  try {
    payloadVersion = normalizeVersion(
      JSON.parse(
        fs.readFileSync(path.join(payloadDir, 'update-config.json'), 'utf8'),
      ).version,
    )
  } catch {
    payloadVersion = ''
  }
  if (payloadVersion !== info.remoteVersion) {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
    return {
      ok: false,
      error: `Downloaded package is version ${payloadVersion || 'unknown'}, expected ${info.remoteVersion}. Update aborted — nothing was changed.`,
    }
  }

  fs.writeFileSync(
    path.join(tmpRoot, 'pending_version.txt'),
    info.remoteVersion,
    'utf8',
  )
  const script = buildApplyScript(root, payloadDir, info.remoteVersion)
  fs.writeFileSync(path.join(tmpRoot, 'apply_update.ps1'), script, 'utf8')
  sendProgress?.({ phase: 'install', percent: 100 })
  return { ok: true, staged: true, version: info.remoteVersion }
}

// Legacy entry — kept for older callers; now stages instead of copying in-place.
async function applyUpdate(root, sendProgress) {
  const result = await stageUpdate(root, sendProgress)
  if (result.ok && !spawnApplyScript(root)) {
    return {
      ok: false,
      error: 'Could not start the installer process. Close Chrome and WhatsApp Sender, then try again.',
    }
  }
  return result
}

module.exports = {
  checkForUpdate,
  applyUpdate,
  stageUpdate,
  spawnApplyScript,
  buildApplyScript,
  loadConfig,
  saveConfig,
  compareVersions,
  DEFAULT_OWNER,
  DEFAULT_REPO,
}
