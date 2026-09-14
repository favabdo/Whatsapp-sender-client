const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { execFileSync } = require('child_process')

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
          out.on('finish', () => {
            out.close(() => resolve(dest))
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

  // Prefer a Release ZIP if it exists and matches/exceeds remote version
  let assetName = null
  let assetUrl = null
  let browserDownloadUrl = null
  let releaseName = null
  let releaseUrl = null
  let downloadMode = 'zipball'

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
    if (asset && compareVersions(releaseVersion, localVersion) > 0) {
      assetName = asset.name
      assetUrl = asset.url || null
      browserDownloadUrl = asset.browser_download_url || null
      releaseName = release.name || release.tag_name
      releaseUrl = release.html_url
      downloadMode = 'release'
    }
  } catch (_) {
    /* no releases — use repo zipball */
  }

  // Fallback: whole branch as zip (runnable files must be in the repo)
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
    notes: '',
  }
}

function copyPreserve(srcDir, destDir, preserveNames) {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const name of fs.readdirSync(srcDir)) {
    if (preserveNames.has(name)) continue
    const from = path.join(srcDir, name)
    const to = path.join(destDir, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) {
      fs.cpSync(from, to, { recursive: true, force: true })
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

function ensureElectronRuntime(root, sendProgress) {
  sendProgress?.({ phase: 'install', percent: 100 })
  const electronExe = path.join(
    root,
    'node_modules',
    'electron',
    'dist',
    'electron.exe',
  )
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return
  if (fs.existsSync(electronExe)) {
    // still refresh deps lightly when package.json changed
    try {
      execFileSync('npm.cmd', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
        cwd: root,
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch (_) {
      /* optional */
    }
    return
  }
  execFileSync('npm.cmd', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  })
}

async function applyUpdate(root, sendProgress) {
  const info = await checkForUpdate(root)
  if (!info.updateAvailable) {
    return { ok: false, error: 'No update available' }
  }
  const cfg = loadConfig(root)
  const token = String(cfg.githubToken || process.env.GITHUB_TOKEN || '').trim()
  const tmpRoot = path.join(root, '_update_tmp')
  fs.rmSync(tmpRoot, { recursive: true, force: true })
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
  fs.mkdirSync(extractDir, { recursive: true })
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
    ],
    { windowsHide: true },
  )

  let payloadDir = extractDir
  const kids = fs.readdirSync(extractDir)
  if (kids.length === 1) {
    const only = path.join(extractDir, kids[0])
    if (fs.statSync(only).isDirectory()) payloadDir = only
  }

  const preserve = new Set([
    'secure',
    'wa_chrome_profile',
    'uploads',
    'users.db',
    '_update_tmp',
    'node_modules',
    'output.log',
  ])
  sendProgress?.({ phase: 'install', percent: 100 })
  copyPreserve(payloadDir, root, preserve)

  // merge users.key from package if local secure missing it
  try {
    const srcKey = path.join(payloadDir, 'secure', 'users.key')
    const dstSecure = path.join(root, 'secure')
    const dstKey = path.join(dstSecure, 'users.key')
    if (fs.existsSync(srcKey)) {
      fs.mkdirSync(dstSecure, { recursive: true })
      if (!fs.existsSync(dstKey)) fs.copyFileSync(srcKey, dstKey)
    }
  } catch (_) {
    /* ignore */
  }

  ensureElectronRuntime(root, sendProgress)

  // bump local version to remote (keep linked repo settings)
  saveConfig(root, {
    version: info.remoteVersion,
    githubOwner: cfg.githubOwner,
    githubRepo: cfg.githubRepo,
    branch: cfg.branch || 'main',
  })

  fs.rmSync(tmpRoot, { recursive: true, force: true })
  return { ok: true, version: info.remoteVersion }
}

module.exports = {
  checkForUpdate,
  applyUpdate,
  loadConfig,
  saveConfig,
  compareVersions,
  DEFAULT_OWNER,
  DEFAULT_REPO,
}
