import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'
import * as os from 'os'
import serve from 'electron-serve'
import { autoUpdater } from 'electron-updater'

const isProd = app.isPackaged || process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'out' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | null = null

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): { width: number; height: number; x?: number; y?: number; isMaximized?: boolean } {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { width: 1200, height: 800 }
  }
}

function saveWindowState() {
  if (!mainWindow) return
  try {
    const isMaximized = mainWindow.isMaximized()
    let bounds: { width: number; height: number; x?: number; y?: number; isMaximized?: boolean } = { width: 1200, height: 800 }
    try {
      const raw = fs.readFileSync(getWindowStatePath(), 'utf-8')
      bounds = JSON.parse(raw)
    } catch {}
    if (!isMaximized) {
      const currentBounds = mainWindow.getBounds()
      bounds.x = currentBounds.x
      bounds.y = currentBounds.y
      bounds.width = currentBounds.width
      bounds.height = currentBounds.height
    }
    bounds.isMaximized = isMaximized
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds))
  } catch {}
}

// ── Git helpers ──────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    cp.execFile('git', args, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: (err as any)?.code ?? 0 })
    })
  })
}

function gitSync(args: string[], cwd: string): string {
  try {
    return cp.execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

// Path to local JSON store for recent repos
function getRecentReposPath() {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

function loadRecentRepos(): string[] {
  try {
    const raw = fs.readFileSync(getRecentReposPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveRecentRepo(repoPath: string) {
  const repos = loadRecentRepos().filter(r => r !== repoPath)
  repos.unshift(repoPath)
  fs.writeFileSync(getRecentReposPath(), JSON.stringify(repos.slice(0, 20)))
}

function removeRecentRepo(repoPath: string) {
  const repos = loadRecentRepos().filter(r => r !== repoPath)
  fs.writeFileSync(getRecentReposPath(), JSON.stringify(repos))
}

// ── Window ───────────────────────────────────────────────────────────────────

async function createWindow() {
  const windowState = loadWindowState()
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    show: false,
    icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'logo.ico' : 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (windowState.isMaximized) mainWindow.maximize()
  mainWindow.show()

  if (isProd) {
    await mainWindow.loadURL('app://-')
  } else {
    const port = process.argv[2] || 3004
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['ws://_next/*', 'wss://_next/*'] },
      (details, callback) => {
        callback({
          redirectURL: details.url.replace(
            /^wss?:\/\/_next\//,
            `ws://localhost:${port}/_next/`
          ),
        })
      }
    )
    await mainWindow.loadURL(`http://localhost:${port}`)
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      if (!isProd) mainWindow!.webContents.toggleDevTools()
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key === 'r') {
      event.preventDefault()
    } else if ((input.control || input.meta) && (input.key === '=' || input.key === '+')) {
      mainWindow!.webContents.setZoomLevel(mainWindow!.webContents.getZoomLevel() + 0.5)
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key === '-') {
      mainWindow!.webContents.setZoomLevel(mainWindow!.webContents.getZoomLevel() - 0.5)
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key === '0') {
      mainWindow!.webContents.setZoomLevel(0)
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('will-reload' as any, (event: Electron.Event) => {
    event.preventDefault()
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow!.webContents.getURL()
    if (currentURL && new URL(url).href === new URL(currentURL).href) {
      event.preventDefault()
    }
  })

  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('closed', () => {
    saveWindowState()
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.on('ready', () => {
  createWindow()

  ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('window-zoom-in', () => {
    mainWindow?.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5)
  })
  ipcMain.on('window-zoom-out', () => {
    mainWindow?.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5)
  })

  // ── Repository management ────────────────────────────────────────────────

  ipcMain.handle('git:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Open Repository',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('git:is-repo', (_e, repoPath: string) => {
    try {
      cp.execFileSync('git', ['-C', repoPath, 'rev-parse', '--git-dir'], { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('git:init', async (_e, repoPath: string) => {
    const r = await git(['init'], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  ipcMain.handle('git:clone', async (_e, { url, dest }: { url: string; dest: string }) => {
    return new Promise((resolve) => {
      const proc = cp.spawn('git', ['clone', '--progress', url, dest])
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString()
        mainWindow?.webContents.send('git:clone-progress', stderr)
      })
      proc.on('close', (code: number | null) => resolve({ ok: code === 0, stderr }))
    })
  })

  ipcMain.handle('git:clone-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Choose destination folder',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // ── Recent repos ─────────────────────────────────────────────────────────

  ipcMain.handle('git:recent-repos', () => {
    const repos = loadRecentRepos()
    return repos.map(p => {
      const exists = fs.existsSync(p)
      const name = path.basename(p)
      return { path: p, name, exists }
    })
  })

  ipcMain.handle('git:add-recent', (_e, repoPath: string) => {
    saveRecentRepo(repoPath)
    return { ok: true }
  })

  ipcMain.handle('git:remove-recent', (_e, repoPath: string) => {
    removeRecentRepo(repoPath)
    return { ok: true }
  })

  // ── Git status / staging ─────────────────────────────────────────────────

  ipcMain.handle('git:status', async (_e, repoPath: string) => {
    const r = await git(['status', '--porcelain=v1', '-u'], repoPath)
    if (r.code !== 0) return { ok: false, files: [] }
    const files = r.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const xy = line.slice(0, 2)
        const filePath = line.slice(3).trim()
        const staged = xy[0] !== ' ' && xy[0] !== '?'
        const unstaged = xy[1] !== ' '
        let status = 'modified'
        const x = xy[0]
        const y = xy[1]
        if (x === '?' && y === '?') status = 'untracked'
        else if (x === 'A') status = 'added'
        else if (x === 'D' || y === 'D') status = 'deleted'
        else if (x === 'R') status = 'renamed'
        else if (x === 'M' || y === 'M') status = 'modified'
        return { path: filePath, status, staged, unstaged }
      })
    return { ok: true, files }
  })

  ipcMain.handle('git:stage', async (_e, { repoPath, files }: { repoPath: string; files: string[] }) => {
    const r = await git(['add', '--', ...files], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  ipcMain.handle('git:stage-all', async (_e, repoPath: string) => {
    const r = await git(['add', '-A'], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  ipcMain.handle('git:unstage', async (_e, { repoPath, files }: { repoPath: string; files: string[] }) => {
    const errs: string[] = []
    for (const f of files) {
      const r = await git(['restore', '--staged', '--', f], repoPath)
      if (r.code !== 0) {
        // fallback for ignored/new files: rm --cached
        const r2 = await git(['rm', '--cached', '--ignore-unmatch', '--', f], repoPath)
        if (r2.code !== 0) errs.push(r2.stderr)
      }
    }
    return { ok: errs.length === 0, stderr: errs.join('\n') }
  })

  ipcMain.handle('git:discard', async (_e, { repoPath, files }: { repoPath: string; files: string[] }) => {
    const r = await git(['restore', '--', ...files], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  // ── Diff ─────────────────────────────────────────────────────────────────

  ipcMain.handle('git:diff', async (_e, { repoPath, filePath, staged }: { repoPath: string; filePath: string; staged: boolean }) => {
    const args = staged
      ? ['diff', '--cached', '--', filePath]
      : ['diff', '--', filePath]
    const r = await git(args, repoPath)
    return { ok: true, diff: r.stdout }
  })

  ipcMain.handle('git:diff-untracked', async (_e, { repoPath, filePath }: { repoPath: string; filePath: string }) => {
    try {
      const fullPath = path.join(repoPath, filePath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      return { ok: true, content }
    } catch {
      return { ok: false, content: '' }
    }
  })

  // ── Commit ───────────────────────────────────────────────────────────────

  ipcMain.handle('git:commit', async (_e, { repoPath, message, description, authorName, authorEmail }: { repoPath: string; message: string; description?: string; authorName?: string; authorEmail?: string }) => {
    const fullMessage = description ? `${message}\n\n${description}` : message
    const args = ['commit', '-m', fullMessage]
    if (authorName) args.unshift('-c', `user.name=${authorName}`)
    if (authorEmail) args.unshift('-c', `user.email=${authorEmail}`)
    const r = await git(args, repoPath)
    return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr }
  })

  // ── Push / pull / fetch ──────────────────────────────────────────────────

  ipcMain.handle('git:push', async (_e, { repoPath, remote, branch }: { repoPath: string; remote: string; branch: string }) => {
    const r = await git(['push', '--set-upstream', remote, branch], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  ipcMain.handle('git:pull', async (_e, { repoPath, remote, branch }: { repoPath: string; remote: string; branch: string }) => {
    const r = await git(['pull', remote, branch], repoPath)
    return { ok: r.code === 0, stderr: r.stderr, stdout: r.stdout }
  })

  ipcMain.handle('git:fetch', async (_e, repoPath: string) => {
    const r = await git(['fetch', '--all', '--prune'], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  // ── Branches ─────────────────────────────────────────────────────────────

  ipcMain.handle('git:branches', async (_e, repoPath: string) => {
    const r = await git(['branch', '-a', '--format=%(refname:short)|%(upstream:short)|%(HEAD)'], repoPath)
    if (r.code !== 0) return { ok: false, branches: [], current: '' }
    const branches = r.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, upstream, head] = line.split('|')
        return { name: name.trim(), upstream: upstream?.trim() ?? '', current: head === '*' }
      })
    const current = branches.find(b => b.current)?.name ?? ''
    return { ok: true, branches, current }
  })

  ipcMain.handle('git:checkout', async (_e, { repoPath, branch, create }: { repoPath: string; branch: string; create?: boolean }) => {
    const args = create ? ['checkout', '-b', branch] : ['checkout', branch]
    const r = await git(args, repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  ipcMain.handle('git:delete-branch', async (_e, { repoPath, branch }: { repoPath: string; branch: string }) => {
    const r = await git(['branch', '-d', branch], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  // ── Remotes ──────────────────────────────────────────────────────────────

  ipcMain.handle('git:remotes', async (_e, repoPath: string) => {
    const r = await git(['remote', '-v'], repoPath)
    if (r.code !== 0) return { ok: false, remotes: [] }
    const seen = new Set<string>()
    const remotes: { name: string; url: string }[] = []
    for (const line of r.stdout.split('\n').filter(Boolean)) {
      const [name, url] = line.split('\t')
      const cleanUrl = url?.replace(/\s*\(fetch\)|\s*\(push\)/, '').trim() ?? ''
      if (!seen.has(name)) {
        seen.add(name)
        remotes.push({ name: name.trim(), url: cleanUrl })
      }
    }
    return { ok: true, remotes }
  })

  // ── Log / history ────────────────────────────────────────────────────────

  ipcMain.handle('git:log', async (_e, { repoPath, limit }: { repoPath: string; limit?: number }) => {
    const r = await git([
      'log',
      `--max-count=${limit ?? 100}`,
      '--pretty=format:%H|%h|%an|%ae|%at|%s|%D',
    ], repoPath)
    if (r.code !== 0) return { ok: false, commits: [] }
    const commits = r.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, short, author, email, ts, subject, refs] = line.split('|')
        return {
          hash: hash ?? '',
          short: short ?? '',
          author: author ?? '',
          email: email ?? '',
          date: new Date(parseInt(ts ?? '0') * 1000).toISOString(),
          message: subject ?? '',
          refs: refs ?? '',
        }
      })
    return { ok: true, commits }
  })

  // ── Commit show (diff + stat) ────────────────────────────────────────────

  ipcMain.handle('git:show', async (_e, { repoPath, hash }: { repoPath: string; hash: string }) => {
    const [diffRes, statRes, bodyRes] = await Promise.all([
      git(['show', '--format=', '--diff-algorithm=histogram', hash], repoPath),
      git(['show', '--format=', '--stat', '--no-patch', hash], repoPath),
      git(['log', '-1', '--format=%B', hash], repoPath),
    ])
    return {
      ok: diffRes.code === 0,
      diff: diffRes.stdout,
      stat: statRes.stdout,
      body: bodyRes.stdout.trim(),
    }
  })

  ipcMain.handle('git:show-files', async (_e, { repoPath, hash }: { repoPath: string; hash: string }) => {
    const r = await git(['show', '--format=', '--name-status', hash], repoPath)
    if (r.code !== 0) return { ok: false, files: [] }
    const files = r.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [status, ...rest] = line.split('\t')
        const filePath = rest.join('\t')
        const statusMap: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted' }
        return { status: statusMap[status?.[0] ?? ''] ?? 'modified', path: filePath }
      })
    return { ok: true, files }
  })

  // ── Repo info ─────────────────────────────────────────────────────────────

  ipcMain.handle('git:repo-info', async (_e, repoPath: string) => {
    const branch = gitSync(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
    const remote = gitSync(['remote', 'get-url', 'origin'], repoPath)
    const detached = branch === 'HEAD'
    const upstream = detached ? '' : gitSync(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath)
    let ahead = ''
    let behind = ''
    if (upstream) {
      ahead  = gitSync(['rev-list', `${upstream}..HEAD`, '--count'], repoPath)
      behind = gitSync(['rev-list', `HEAD..${upstream}`, '--count'], repoPath)
    } else if (remote && !detached) {
      // no upstream set yet — count all local commits not on the remote as "ahead"
      const remoteName = gitSync(['remote'], repoPath).split('\n')[0]?.trim()
      if (remoteName) {
        const remoteBranch = gitSync(['ls-remote', '--symref', remoteName, 'HEAD'], repoPath)
        const m = remoteBranch.match(/refs\/heads\/(\S+)/)
        const defaultBranch = m ? m[1] : 'main'
        const remoteRef = `${remoteName}/${defaultBranch}`
        const hasRemoteRef = gitSync(['rev-parse', '--verify', remoteRef], repoPath)
        if (hasRemoteRef) {
          ahead = gitSync(['rev-list', `${remoteRef}..HEAD`, '--count'], repoPath)
        } else {
          // remote exists but nothing pushed yet — count all commits
          ahead = gitSync(['rev-list', 'HEAD', '--count'], repoPath)
        }
      }
    }
    return {
      branch: detached ? gitSync(['rev-parse', '--short', 'HEAD'], repoPath) : branch,
      remote,
      aheadBy: parseInt(ahead) || 0,
      behindBy: parseInt(behind) || 0,
    }
  })

  // ── GitHub OAuth Device Flow ──────────────────────────────────────────────

  ipcMain.handle('github:device-flow-start', async () => {
    try {
      const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: 'Ov23liAqa1r9tEcp6lIZ', scope: 'repo,read:user,user:email' }),
      })
      const text = await res.text()
      console.log('[github:device-flow-start] status:', res.status, 'body:', text)
      const data = JSON.parse(text) as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; error?: string; error_description?: string }
      if (data.error) return { ok: false, error: data.error_description ?? data.error }
      return { ok: true, ...data }
    } catch (e: any) {
      console.error('[github:device-flow-start] error:', e)
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('github:device-flow-poll', async (_e, { device_code, interval }: { device_code: string; interval: number }) => {
    await new Promise(r => setTimeout(r, (interval || 5) * 1000))
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: 'Ov23liAqa1r9tEcp6lIZ', device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
      })
      const data = await res.json() as { access_token?: string; error?: string }
      return { ok: !!data.access_token, token: data.access_token, error: data.error }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('github:open-auth-url', (_e, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('github:get-user', async (_e, token: string) => {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      const data = await res.json() as { login: string; name: string; avatar_url: string; email: string }
      return { ok: true, user: data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('github:list-repos', async (_e, token: string) => {
    try {
      const repos: { name: string; full_name: string; clone_url: string; private: boolean; description: string | null; updated_at: string }[] = []
      let page = 1
      while (true) {
        const res = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        })
        if (!res.ok) break
        const batch = await res.json() as typeof repos
        if (!batch.length) break
        repos.push(...batch)
        if (batch.length < 100) break
        page++
      }
      return { ok: true, repos }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('github:check-repo-name', async (_e, { token, name }: { token: string; name: string }) => {
    try {
      const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
      const user = await userRes.json() as { login: string }
      const res = await fetch(`https://api.github.com/repos/${user.login}/${name}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
      return { available: res.status === 404 }
    } catch { return { available: false } }
  })

  ipcMain.handle('github:repo-exists', async (_e, { token, repoUrl }: { token: string; repoUrl: string }) => {
    try {
      // extract owner/repo from clone URL (https or ssh)
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { exists: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      return { exists: res.status === 200 }
    } catch { return { exists: false } }
  })

  ipcMain.handle('github:create-repo', async (_e, { token, name, description, isPrivate }: { token: string; name: string; description: string; isPrivate: boolean }) => {
    try {
      const res = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, private: isPrivate, auto_init: false }),
      })
      const data = await res.json() as { clone_url: string; html_url: string; full_name: string; message?: string }
      if (!res.ok) return { ok: false, error: data.message ?? 'Failed to create repository' }
      return { ok: true, cloneUrl: data.clone_url, htmlUrl: data.html_url, fullName: data.full_name }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('git:list-files', async (_e, repoPath: string) => {
    try {
      const files: string[] = []
      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === '.git') continue
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else files.push(path.relative(repoPath, full).replace(/\\/g, '/'))
        }
      }
      walk(repoPath)
      return { ok: true, files }
    } catch (e: any) { return { ok: false, files: [], error: e.message } }
  })

  ipcMain.handle('git:read-gitignore', async (_e, repoPath: string) => {
    try {
      const gitignorePath = path.join(repoPath, '.gitignore')
      if (!fs.existsSync(gitignorePath)) return { ok: true, patterns: [] }
      const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'))
      return { ok: true, patterns: lines }
    } catch (e: any) { return { ok: false, patterns: [], error: e.message } }
  })

  ipcMain.handle('git:write-gitignore', async (_e, { repoPath, patterns }: { repoPath: string; patterns: string[] }) => {
    try {
      const gitignorePath = path.join(repoPath, '.gitignore')
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : ''
      const lines = existing ? existing.split('\n').filter(Boolean) : []
      const normalized = new Set(lines.map(l => l.replace(/\/$/, '')))
      for (const p of patterns) {
        if (!normalized.has(p.replace(/\/$/, ''))) lines.push(p)
      }
      fs.writeFileSync(gitignorePath, lines.join('\n') + '\n')
      // find only the tracked files that are now ignored and remove them from the index
      const ignored = await git(['ls-files', '--ignored', '--exclude-standard', '--cached'], repoPath)
      const ignoredFiles = ignored.stdout.split('\n').map(f => f.trim()).filter(Boolean)
      if (ignoredFiles.length > 0) {
        await git(['rm', '-r', '--cached', '--ignore-unmatch', '--', ...ignoredFiles], repoPath)
      }
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('git:add-remote', async (_e, { repoPath, name, url }: { repoPath: string; name: string; url: string }) => {
    const existing = await git(['remote', 'get-url', name], repoPath)
    if (existing.code === 0) {
      // remote exists — update its URL instead
      const r = await git(['remote', 'set-url', name, url], repoPath)
      return { ok: r.code === 0, stderr: r.stderr }
    }
    const r = await git(['remote', 'add', name, url], repoPath)
    return { ok: r.code === 0, stderr: r.stderr }
  })

  // ── Store (auth token, prefs) ─────────────────────────────────────────────

  const storePath = path.join(app.getPath('userData'), 'store.json')

  function readStore(): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(storePath, 'utf-8')) } catch { return {} }
  }

  ipcMain.handle('store:get', (_e, key: string) => readStore()[key] ?? null)
  ipcMain.handle('store:set', (_e, { key, value }: { key: string; value: unknown }) => {
    const store = readStore()
    store[key] = value
    fs.writeFileSync(storePath, JSON.stringify(store))
    return { ok: true }
  })
  ipcMain.handle('store:delete', (_e, key: string) => {
    const store = readStore()
    delete store[key]
    fs.writeFileSync(storePath, JSON.stringify(store))
    return { ok: true }
  })

  // ── Open in file manager ──────────────────────────────────────────────────

  ipcMain.handle('shell:open-path', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:show-item', (_e, p: string) => shell.showItemInFolder(p))

  // ── GitHub PR handlers ────────────────────────────────────────────────────

  // github:list-prs — list PRs for a repo
  ipcMain.handle('github:list-prs', async (_e, { token, repoUrl, state }: { token: string; repoUrl: string; state: 'open' | 'closed' | 'all' }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, prs: [] }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls?state=${state}&per_page=50&sort=updated`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, prs: [], error: `GitHub ${res.status}` }
      const data = await res.json() as any[]
      const prs = data.map(pr => ({
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.state,
        draft: pr.draft,
        merged: pr.pull_request?.merged_at != null || pr.merged_at != null,
        author: { login: pr.user.login, avatarUrl: pr.user.avatar_url },
        head: { ref: pr.head.ref, sha: pr.head.sha },
        base: { ref: pr.base.ref },
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        reviewDecision: pr.requested_reviewers?.length > 0 ? 'review_required' : null,
        checks: null as null,
        comments: pr.comments ?? 0,
        htmlUrl: pr.html_url,
        mergeable: pr.mergeable,
      }))
      return { ok: true, prs }
    } catch (e: any) { return { ok: false, prs: [], error: e.message } }
  })

  // github:get-pr — single PR detail with checks
  ipcMain.handle('github:get-pr', async (_e, { token, repoUrl, number }: { token: string; repoUrl: string; number: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const [prRes, checksRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }),
        fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}/reviews`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }),
      ])
      const pr = await prRes.json() as any
      const reviews = checksRes.ok ? await checksRes.json() as any[] : []
      // get status checks
      const statusRes = await fetch(`https://api.github.com/repos/${m[1]}/commits/${pr.head.sha}/check-runs`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
      const statusData = statusRes.ok ? await statusRes.json() as any : { check_runs: [] }
      return {
        ok: true,
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body ?? '',
          state: pr.state,
          draft: pr.draft,
          merged: pr.merged,
          mergedAt: pr.merged_at,
          mergeable: pr.mergeable,
          mergeableState: pr.mergeable_state,
          author: { login: pr.user.login, avatarUrl: pr.user.avatar_url },
          head: { ref: pr.head.ref, sha: pr.head.sha, repoCloneUrl: pr.head.repo?.clone_url },
          base: { ref: pr.base.ref },
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          comments: pr.comments ?? 0,
          htmlUrl: pr.html_url,
          reviews: reviews.map((r: any) => ({ author: r.user.login, state: r.state, submittedAt: r.submitted_at })),
          checkRuns: (statusData.check_runs ?? []).map((c: any) => ({ name: c.name, status: c.status, conclusion: c.conclusion, htmlUrl: c.html_url })),
        }
      }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:get-pr-diff — PR file changes
  ipcMain.handle('github:get-pr-diff', async (_e, { token, repoUrl, number }: { token: string; repoUrl: string; number: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, files: [] }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}/files?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, files: [] }
      const data = await res.json() as any[]
      const files = data.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? '',
      }))
      return { ok: true, files }
    } catch (e: any) { return { ok: false, files: [], error: e.message } }
  })

  // github:get-pr-comments — PR comments
  ipcMain.handle('github:get-pr-comments', async (_e, { token, repoUrl, number }: { token: string; repoUrl: string; number: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, comments: [] }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/issues/${number}/comments?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, comments: [] }
      const data = await res.json() as any[]
      const comments = data.map((c: any) => ({
        id: c.id,
        author: { login: c.user.login, avatarUrl: c.user.avatar_url },
        body: c.body,
        createdAt: c.created_at,
      }))
      return { ok: true, comments }
    } catch (e: any) { return { ok: false, comments: [], error: e.message } }
  })

  // github:add-comment
  ipcMain.handle('github:add-comment', async (_e, { token, repoUrl, number, body }: { token: string; repoUrl: string; number: number; body: string }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/issues/${number}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      return { ok: res.ok }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:create-pr
  ipcMain.handle('github:create-pr', async (_e, { token, repoUrl, title, body, head, base, draft }: { token: string; repoUrl: string; title: string; body: string; head: string; base: string; draft: boolean }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, head, base, draft }),
      })
      const data = await res.json() as any
      if (!res.ok) return { ok: false, error: data.message ?? 'Failed to create PR' }
      return { ok: true, number: data.number, htmlUrl: data.html_url }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:merge-pr
  ipcMain.handle('github:merge-pr', async (_e, { token, repoUrl, number, method }: { token: string; repoUrl: string; number: number; method: 'merge' | 'squash' | 'rebase' }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}/merge`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_method: method }),
      })
      return { ok: res.ok, status: res.status }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:close-pr
  ipcMain.handle('github:close-pr', async (_e, { token, repoUrl, number }: { token: string; repoUrl: string; number: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      })
      return { ok: res.ok }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:reopen-pr
  ipcMain.handle('github:reopen-pr', async (_e, { token, repoUrl, number }: { token: string; repoUrl: string; number: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/pulls/${number}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'open' }),
      })
      return { ok: res.ok }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:list-workflow-runs — recent runs for the repo (optionally filtered by branch)
  ipcMain.handle('github:list-workflow-runs', async (_e, { token, repoUrl, branch }: { token: string; repoUrl: string; branch?: string }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, runs: [] }
      const branchParam = branch ? `&branch=${encodeURIComponent(branch)}` : ''
      const res = await fetch(`https://api.github.com/repos/${m[1]}/actions/runs?per_page=30${branchParam}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, runs: [], error: `GitHub ${res.status}` }
      const data = await res.json() as any
      const runs = (data.workflow_runs ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        displayTitle: r.display_title,
        status: r.status,
        conclusion: r.conclusion,
        event: r.event,
        branch: r.head_branch,
        sha: r.head_sha,
        commitMessage: r.head_commit?.message ?? '',
        actor: { login: r.actor?.login ?? '', avatarUrl: r.actor?.avatar_url ?? '' },
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        runNumber: r.run_number,
        htmlUrl: r.html_url,
        workflowId: r.workflow_id,
      }))
      return { ok: true, runs }
    } catch (e: any) { return { ok: false, runs: [], error: e.message } }
  })

  // github:get-workflow-run-jobs — jobs + steps for a single run
  ipcMain.handle('github:get-workflow-run-jobs', async (_e, { token, repoUrl, runId }: { token: string; repoUrl: string; runId: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, jobs: [] }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/actions/runs/${runId}/jobs?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, jobs: [] }
      const data = await res.json() as any
      const jobs = (data.jobs ?? []).map((j: any) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        htmlUrl: j.html_url,
        steps: (j.steps ?? []).map((s: any) => ({
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          number: s.number,
          startedAt: s.started_at ?? null,
          completedAt: s.completed_at ?? null,
        })),
      }))
      return { ok: true, jobs }
    } catch (e: any) { return { ok: false, jobs: [], error: e.message } }
  })

  // github:rerun-workflow — re-run a failed workflow run
  ipcMain.handle('github:rerun-workflow', async (_e, { token, repoUrl, runId }: { token: string; repoUrl: string; runId: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false }
      const res = await fetch(`https://api.github.com/repos/${m[1]}/actions/runs/${runId}/rerun`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      return { ok: res.ok || res.status === 201 }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // github:get-job-logs — fetch raw log text for a single job
  ipcMain.handle('github:get-job-logs', async (_e, { token, repoUrl, jobId }: { token: string; repoUrl: string; jobId: number }) => {
    try {
      const m = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
      if (!m) return { ok: false, logs: '' }
      // GitHub responds with 302 → pre-signed S3 URL; fetch follows redirects by default
      const res = await fetch(`https://api.github.com/repos/${m[1]}/actions/jobs/${jobId}/logs`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { ok: false, logs: '', error: `GitHub ${res.status}` }
      const logs = await res.text()
      return { ok: true, logs }
    } catch (e: any) { return { ok: false, logs: '', error: e.message } }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Auto-updater
if (isProd) {
  const logFile = fs.createWriteStream(path.join(app.getPath('userData'), 'updater.log'), { flags: 'a' })
  const log = {
    info:  (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] INFO  ${a.join(' ')}\n`; logFile.write(msg) },
    warn:  (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] WARN  ${a.join(' ')}\n`; logFile.write(msg) },
    error: (...a: unknown[]) => { const msg = `[${new Date().toISOString()}] ERROR ${a.join(' ')}\n`; logFile.write(msg) },
  }
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({ provider: 'github', owner: 'Marijanoo', repo: 'quence-git' })

  autoUpdater.on('update-available', () => mainWindow?.webContents.send('update-available'))
  autoUpdater.on('download-progress', (info) => mainWindow?.webContents.send('update-progress', info.percent))
  autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update-downloaded'))

  ipcMain.on('install-update', () => autoUpdater.quitAndInstall(true, false))

  app.on('browser-window-created', (_, win) => {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
    })
  })
}

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
