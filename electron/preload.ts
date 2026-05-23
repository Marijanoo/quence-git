import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  zoomIn:   () => ipcRenderer.send('window-zoom-in'),
  zoomOut:  () => ipcRenderer.send('window-zoom-out'),
  onUpdateAvailable:  (cb: () => void) => ipcRenderer.on('update-available', cb),
  onUpdateProgress:   (cb: (percent: number) => void) => ipcRenderer.on('update-progress', (_e, percent) => cb(percent)),
  onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update-downloaded', cb),
  installUpdate: () => ipcRenderer.send('install-update'),

  git: {
    openDialog:      () => ipcRenderer.invoke('git:open-dialog'),
    cloneDialog:     () => ipcRenderer.invoke('git:clone-dialog'),
    isRepo:          (p: string) => ipcRenderer.invoke('git:is-repo', p),
    init:            (p: string) => ipcRenderer.invoke('git:init', p),
    clone:           (url: string, dest: string) => ipcRenderer.invoke('git:clone', { url, dest }),
    onCloneProgress: (cb: (s: string) => void) => ipcRenderer.on('git:clone-progress', (_e, s) => cb(s)),

    recentRepos: () => ipcRenderer.invoke('git:recent-repos'),
    addRecent:   (p: string) => ipcRenderer.invoke('git:add-recent', p),
    removeRecent:(p: string) => ipcRenderer.invoke('git:remove-recent', p),

    status:    (p: string) => ipcRenderer.invoke('git:status', p),
    stage:     (p: string, files: string[]) => ipcRenderer.invoke('git:stage', { repoPath: p, files }),
    stageAll:  (p: string) => ipcRenderer.invoke('git:stage-all', p),
    unstage:   (p: string, files: string[]) => ipcRenderer.invoke('git:unstage', { repoPath: p, files }),
    discard:   (p: string, files: string[]) => ipcRenderer.invoke('git:discard', { repoPath: p, files }),

    diff:          (p: string, file: string, staged: boolean) => ipcRenderer.invoke('git:diff', { repoPath: p, filePath: file, staged }),
    diffUntracked: (p: string, file: string) => ipcRenderer.invoke('git:diff-untracked', { repoPath: p, filePath: file }),

    commit: (p: string, message: string, description?: string, authorName?: string, authorEmail?: string) => ipcRenderer.invoke('git:commit', { repoPath: p, message, description, authorName, authorEmail }),

    push:  (p: string, remote: string, branch: string) => ipcRenderer.invoke('git:push', { repoPath: p, remote, branch }),
    pull:  (p: string, remote: string, branch: string) => ipcRenderer.invoke('git:pull', { repoPath: p, remote, branch }),
    fetch: (p: string) => ipcRenderer.invoke('git:fetch', p),

    branches:     (p: string) => ipcRenderer.invoke('git:branches', p),
    checkout:     (p: string, branch: string, create?: boolean) => ipcRenderer.invoke('git:checkout', { repoPath: p, branch, create }),
    deleteBranch: (p: string, branch: string) => ipcRenderer.invoke('git:delete-branch', { repoPath: p, branch }),

    remotes:       (p: string) => ipcRenderer.invoke('git:remotes', p),
    listFiles:     (p: string) => ipcRenderer.invoke('git:list-files', p),
    readGitignore: (p: string) => ipcRenderer.invoke('git:read-gitignore', p),
    writeGitignore:(p: string, patterns: string[]) => ipcRenderer.invoke('git:write-gitignore', { repoPath: p, patterns }),
    addRemote:     (p: string, name: string, url: string) => ipcRenderer.invoke('git:add-remote', { repoPath: p, name, url }),

    log:       (p: string, limit?: number) => ipcRenderer.invoke('git:log', { repoPath: p, limit }),
    show:      (p: string, hash: string) => ipcRenderer.invoke('git:show', { repoPath: p, hash }),
    showFiles: (p: string, hash: string) => ipcRenderer.invoke('git:show-files', { repoPath: p, hash }),
    repoInfo:  (p: string) => ipcRenderer.invoke('git:repo-info', p),
  },

  github: {
    deviceFlowStart: () => ipcRenderer.invoke('github:device-flow-start'),
    deviceFlowPoll:  (deviceCode: string, interval: number) => ipcRenderer.invoke('github:device-flow-poll', { device_code: deviceCode, interval }),
    openAuthUrl:     (url: string) => ipcRenderer.invoke('github:open-auth-url', url),
    getUser:         (token: string) => ipcRenderer.invoke('github:get-user', token),
    listRepos:       (token: string) => ipcRenderer.invoke('github:list-repos', token),
    checkRepoName:   (token: string, name: string) => ipcRenderer.invoke('github:check-repo-name', { token, name }),
    repoExists:      (token: string, repoUrl: string) => ipcRenderer.invoke('github:repo-exists', { token, repoUrl }),
    createRepo:      (token: string, name: string, description: string, isPrivate: boolean) => ipcRenderer.invoke('github:create-repo', { token, name, description, isPrivate }),
  },

  store: {
    get:    (key: string) => ipcRenderer.invoke('store:get', key),
    set:    (key: string, value: unknown) => ipcRenderer.invoke('store:set', { key, value }),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },

  shell: {
    openPath:  (p: string) => ipcRenderer.invoke('shell:open-path', p),
    showItem:  (p: string) => ipcRenderer.invoke('shell:show-item', p),
  },
})
