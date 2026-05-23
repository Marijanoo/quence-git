'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Minus, Square, X, Settings2, GitBranch, RefreshCw, ArrowUp, ArrowDown, LogOut, Github, FolderOpen, ChevronDown, Plus, Trash2, Check, GitCommitHorizontal, History } from 'lucide-react'
import Image from 'next/image'
import { UpdateBar } from '@/components/update-bar'
import { SettingsPanel, applySettings, DEFAULTS } from '@/components/settings-panel'
import { MainPanel } from '@/components/main-panel'
import { WelcomeScreen } from '@/components/welcome-screen'
import { DeviceFlowDialog } from '@/components/device-flow-dialog'
import { CloneDialog } from '@/components/clone-dialog'
import { toast } from 'sonner'

const version = '0.1.0'

export type ActiveView = 'changes' | 'history' | 'pull-requests' | 'actions'

export default function Home() {
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [repoName, setRepoName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [aheadBy, setAheadBy] = useState(0)
  const [behindBy, setBehindBy] = useState(0)
  const [activeView, setActiveView] = useState<ActiveView>('changes')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isFetching, setIsFetching] = useState(false)
  const [autoFetch, setAutoFetch] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [githubAccounts, setGithubAccounts] = useState<GitHubAccount[]>([])
  const [activeAccount, setActiveAccount] = useState<string | null>(null) // login
  const [profileOpen, setProfileOpen] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const [repoSwitcherOpen, setRepoSwitcherOpen] = useState(false)
  const [recentRepos, setRecentRepos] = useState<{ path: string; name: string; exists: boolean }[]>([])
  const [cloneOpen, setCloneOpen] = useState(false)
  const [githubSkipped, setGithubSkipped] = useState(false)
  const [switchingToRepo, setSwitchingToRepo] = useState<string | null>(null)
  const repoSwitcherRef = useRef<HTMLDivElement>(null)

  const [branchSwitcherOpen, setBranchSwitcherOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const branchSwitcherRef = useRef<HTMLDivElement>(null)

  const githubUser = githubAccounts.find(a => a.login === activeAccount) ?? githubAccounts[0] ?? null

  useEffect(() => {
    try {
      const raw = localStorage.getItem('quence-git-theme')
      applySettings(raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS)
    } catch { applySettings(DEFAULTS) }
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onUpdateDownloaded) return
    api.onUpdateAvailable?.(() => setUpdateProgress(0))
    api.onUpdateProgress?.((p) => setUpdateProgress(p))
    api.onUpdateDownloaded(() => { setUpdateProgress(100); setUpdateDownloaded(true) })
  }, [])

  useEffect(() => {
    async function init() {
      // 1. load accounts
      const raw = await window.electronAPI?.store.get('github-accounts')
      const active = await window.electronAPI?.store.get('github-active') as string | null
      if (Array.isArray(raw) && raw.length) {
        const accounts: GitHubAccount[] = (raw as any[]).map(a => ({ name: a.login, email: '', ...a }))
        setGithubAccounts(accounts)
        setActiveAccount(active ?? accounts[0].login)
      } else {
        const t = await window.electronAPI?.store.get('github-token')
        if (t && typeof t === 'string') {
          const r = await window.electronAPI?.github.getUser(t)
          if (r?.ok && r.user) {
            const account: GitHubAccount = { login: r.user.login, name: r.user.name ?? r.user.login, email: r.user.email ?? '', avatarUrl: r.user.avatar_url, token: t }
            setGithubAccounts([account])
            setActiveAccount(account.login)
            await window.electronAPI?.store.set('github-accounts', [account])
            await window.electronAPI?.store.set('github-active', account.login)
          }
        }
      }

      // 2. restore last repo
      const last = await window.electronAPI?.store.get('last-repo') as string | null
      if (last) {
        const name = last.split(/[/\\]/).pop() ?? last
        setSwitchingToRepo(name)
        const exists = await window.electronAPI?.git.isRepo(last)
        if (exists) {
          setRepoPath(last)
          setRepoName(name)
          const [info, branchRes] = await Promise.all([
            window.electronAPI?.git.repoInfo(last),
            window.electronAPI?.git.branches(last),
          ])
          if (info) { setBranch(info.branch); setAheadBy(info.aheadBy); setBehindBy(info.behindBy); if (info.remote) setRepoUrl(info.remote) }
          if (branchRes?.ok) setBranches(branchRes.branches)
        } else {
          toast.error(`Last repository no longer exists: ${name}`)
          await window.electronAPI?.store.delete('last-repo')
        }
        setSwitchingToRepo(null)
      }

      setInitializing(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!profileOpen) return
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    // defer so the opening click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick) }
  }, [profileOpen])

  useEffect(() => {
    if (!repoSwitcherOpen) return
    window.electronAPI?.git.recentRepos().then(setRecentRepos)
    function handleClick(e: MouseEvent) {
      if (repoSwitcherRef.current && !repoSwitcherRef.current.contains(e.target as Node)) setRepoSwitcherOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick) }
  }, [repoSwitcherOpen])

  useEffect(() => {
    if (!branchSwitcherOpen) { setCreatingBranch(false); setNewBranchName(''); return }
    function handleClick(e: MouseEvent) {
      if (branchSwitcherRef.current && !branchSwitcherRef.current.contains(e.target as Node)) setBranchSwitcherOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick) }
  }, [branchSwitcherOpen])

  async function saveAccounts(accounts: GitHubAccount[], active: string | null) {
    setGithubAccounts(accounts)
    setActiveAccount(active)
    await window.electronAPI?.store.set('github-accounts', accounts)
    await window.electronAPI?.store.set('github-active', active ?? '')
    // keep legacy key in sync for clone dialog
    const activeAcc = accounts.find(a => a.login === active)
    if (activeAcc) await window.electronAPI?.store.set('github-token', activeAcc.token)
    else await window.electronAPI?.store.delete('github-token')
  }

  async function handleSwitchAccount(login: string) {
    setActiveAccount(login)
    await window.electronAPI?.store.set('github-active', login)
    const acc = githubAccounts.find(a => a.login === login)
    if (acc) await window.electronAPI?.store.set('github-token', acc.token)
    setProfileOpen(false)
  }

  async function handleRemoveAccount(login: string) {
    const next = githubAccounts.filter(a => a.login !== login)
    const nextActive = activeAccount === login ? (next[0]?.login ?? null) : activeAccount
    await saveAccounts(next, nextActive)
    toast.success(`Removed ${login}`)
  }

  function handleAddAccount() {
    setProfileOpen(false)
    setAddingAccount(true)
  }

  async function handleAccountAdded(user: GitHubAccount) {
    setAddingAccount(false)
    const exists = githubAccounts.find(a => a.login === user.login)
    const next = exists
      ? githubAccounts.map(a => a.login === user.login ? user : a)
      : [...githubAccounts, user]
    await saveAccounts(next, user.login)
    toast.success(`Switched to ${user.login}`)
  }

  const loadBranches = useCallback(async (path: string) => {
    const r = await window.electronAPI?.git.branches(path)
    if (r?.ok) setBranches(r.branches)
  }, [])

  const loadRepoInfo = useCallback(async (path: string) => {
    const info = await window.electronAPI?.git.repoInfo(path)
    if (info) {
      setBranch(info.branch)
      setAheadBy(info.aheadBy)
      setBehindBy(info.behindBy)
      if (info.remote) setRepoUrl(info.remote)
    }
    loadBranches(path)
  }, [loadBranches])

  const openRepo = useCallback(async (path: string) => {
    const name = path.split(/[/\\]/).pop() ?? path
    setSwitchingToRepo(name)
    const isRepo = await window.electronAPI?.git.isRepo(path)
    if (!isRepo) {
      setSwitchingToRepo(null)
      toast.error('Not a git repository')
      return
    }
    setRepoPath(path)
    setRepoName(name)
    await window.electronAPI?.git.addRecent(path)
    await window.electronAPI?.store.set('last-repo', path)
    await loadRepoInfo(path)
    setSwitchingToRepo(null)
  }, [loadRepoInfo])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
    if (repoPath) loadRepoInfo(repoPath)
  }, [repoPath, loadRepoInfo])

  const handleFetch = useCallback(async (silent = false) => {
    if (!repoPath) return
    setIsFetching(true)
    const r = await window.electronAPI?.git.fetch(repoPath)
    setIsFetching(false)
    if (r?.ok) {
      if (!silent) toast.success('Fetched')
      refresh()
    } else {
      if (!silent) toast.error('Fetch failed')
    }
  }, [repoPath, refresh])

  useEffect(() => {
    if (!autoFetch || !repoPath) return
    const id = setInterval(() => handleFetch(true), 15000)
    return () => clearInterval(id)
  }, [autoFetch, repoPath, handleFetch])

  async function handleCheckoutBranch(name: string) {
    if (!repoPath || name === branch) return
    const r = await window.electronAPI?.git.checkout(repoPath, name)
    if (r?.ok) { setBranchSwitcherOpen(false); refresh() }
    else toast.error(r?.stderr ?? 'Checkout failed')
  }

  function sanitizeBranchName(name: string): string {
    return name
      .replace(/\s+/g, '-')          // spaces → hyphens
      .replace(/[~^:?*\[\\]/g, '-')  // git-forbidden chars → hyphens
      .replace(/\.{2,}/g, '-')       // consecutive dots → hyphen
      .replace(/^[./]+/, '')         // no leading dot or slash
      .replace(/[./]+$/, '')         // no trailing dot or slash
      .replace(/-{2,}/g, '-')        // collapse consecutive hyphens
      .toLowerCase()
  }

  async function handleCreateBranch() {
    if (!repoPath || !newBranchName.trim()) return
    const r = await window.electronAPI?.git.checkout(repoPath, newBranchName.trim(), true)
    if (r?.ok) { setNewBranchName(''); setCreatingBranch(false); setBranchSwitcherOpen(false); refresh() }
    else toast.error(r?.stderr ?? 'Failed to create branch')
  }

  async function handleDeleteBranch(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!repoPath) return
    if (name === branch) { toast.error("Can't delete current branch"); return }
    const r = await window.electronAPI?.git.deleteBranch(repoPath, name)
    if (r?.ok) { toast.success(`Deleted ${name}`); loadBranches(repoPath) }
    else toast.error(r?.stderr ?? 'Delete failed')
  }

  async function handleOpenRepo() {
    const path = await window.electronAPI?.git.openDialog()
    if (path) { setRepoSwitcherOpen(false); openRepo(path) }
  }

  async function handleInitRepo() {
    const path = await window.electronAPI?.git.openDialog()
    if (!path) return
    const r = await window.electronAPI?.git.init(path)
    if (r?.ok) { toast.success('Repository initialized'); setRepoSwitcherOpen(false); openRepo(path) }
    else toast.error('Failed to initialize repository')
  }

  async function handleRemoveRecent(repoPath: string, e: React.MouseEvent) {
    e.stopPropagation()
    await window.electronAPI?.git.removeRecent(repoPath)
    setRecentRepos(r => r.filter(x => x.path !== repoPath))
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Title bar */}
      <div
        className="flex items-stretch h-9 bg-card border-b border-border shrink-0 select-none overflow-hidden"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 px-3 flex-1 min-w-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <Image src="/logo.png" alt="QuenceGIT" width={16} height={16} className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
          <span className="text-sm font-semibold text-foreground shrink-0">QuenceGIT</span>

          {/* Repo switcher */}
          <div ref={repoSwitcherRef} className="relative flex items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setRepoSwitcherOpen(o => !o)}
              className="flex items-center gap-1.5 px-2 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium max-w-[160px] truncate">{repoName || 'Open repository'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {repoSwitcherOpen && (
              <div className="fixed top-9 left-24 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent</p>
                </div>
                {recentRepos.length === 0 && (
                  <div className="px-3 py-2 border-b border-border/50">
                    <p className="text-xs text-muted-foreground/50">No recent repositories</p>
                  </div>
                )}
                {recentRepos.slice(0, 8).map(r => (
                  <div
                    key={r.path}
                    onClick={() => { if (r.exists) { openRepo(r.path); setRepoSwitcherOpen(false) } }}
                    className={`flex items-center gap-2.5 px-3 py-2 group border-b border-border/50 ${r.exists ? 'cursor-pointer hover:bg-secondary/50' : 'opacity-40 cursor-not-allowed'} ${r.path === repoPath ? 'bg-accent/10' : ''}`}
                  >
                    <GitBranch className={`h-3.5 w-3.5 shrink-0 ${r.path === repoPath ? 'text-accent' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${r.path === repoPath ? 'text-accent' : 'text-foreground'}`}>{r.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.path}</p>
                    </div>
                    <button onClick={(e) => handleRemoveRecent(r.path, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0 p-0.5">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="p-1">
                  <button onClick={handleOpenRepo} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                    <FolderOpen className="h-3.5 w-3.5" />Open repository…
                  </button>
                  <button onClick={() => { setRepoSwitcherOpen(false); setCloneOpen(true) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                    <GitBranch className="h-3.5 w-3.5" />Clone repository…
                  </button>
                  <button onClick={handleInitRepo} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                    <Plus className="h-3.5 w-3.5" />New repository…
                  </button>
                </div>
              </div>
            )}
          </div>

          {branch && (
            <div ref={branchSwitcherRef} className="relative flex items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                onClick={() => setBranchSwitcherOpen(o => !o)}
                className="flex items-center gap-1.5 px-2 h-6 rounded text-accent hover:bg-secondary transition-colors"
              >
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="text-xs font-medium max-w-[120px] truncate">{branch}</span>
                {aheadBy > 0 && <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><ArrowUp className="h-2.5 w-2.5" />{aheadBy}</span>}
                {behindBy > 0 && <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><ArrowDown className="h-2.5 w-2.5" />{behindBy}</span>}
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
              {branchSwitcherOpen && (() => {
                const localBranches = branches.filter(b => !b.name.startsWith('remotes/'))
                return (
                  <div className="fixed top-9 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden" style={{ left: branchSwitcherRef.current ? branchSwitcherRef.current.getBoundingClientRect().left : 0 }}>
                    {localBranches.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 border-b border-border">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Branches</p>
                        </div>
                        {localBranches.map(b => (
                          <div
                            key={b.name}
                            onClick={() => handleCheckoutBranch(b.name)}
                            className={`flex items-center gap-2.5 px-3 py-2 group border-b border-border/50 cursor-pointer transition-colors ${b.current ? 'bg-accent/10' : 'hover:bg-secondary/50'}`}
                          >
                            <GitBranch className={`h-3.5 w-3.5 shrink-0 ${b.current ? 'text-accent' : 'text-muted-foreground'}`} />
                            <span className={`text-xs font-medium truncate flex-1 ${b.current ? 'text-accent' : 'text-foreground'}`}>{b.name}</span>
                            {!b.current && (
                              <button
                                onClick={(e) => handleDeleteBranch(b.name, e)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0 p-0.5"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    {localBranches.length === 0 && (
                      <div className="px-3 py-2 border-b border-border/50">
                        <p className="text-xs text-muted-foreground/50">No branches</p>
                      </div>
                    )}
                    <div className="p-1">
                      {creatingBranch ? (
                        <input
                          autoFocus
                          value={newBranchName}
                          onChange={e => setNewBranchName(sanitizeBranchName(e.target.value))}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setCreatingBranch(false) }}
                          placeholder="New branch name…"
                          className="w-full h-7 px-2 rounded text-xs bg-input border border-border outline-none focus:border-accent/50 text-foreground placeholder:text-muted-foreground/50"
                        />
                      ) : (
                        <button onClick={() => setCreatingBranch(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                          <Plus className="h-3.5 w-3.5" />New branch…
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
          {/* Nav tabs */}
          {repoPath && (
            <div className="flex items-stretch ml-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <div className="w-px h-3.5 bg-border mx-1 shrink-0 self-center" />
              <button
                onClick={() => setActiveView('changes')}
                className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors border-b-2 ${activeView === 'changes' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                Changes
              </button>
              <div className="w-px h-3.5 bg-border mx-1 shrink-0 self-center" />
              <button
                onClick={() => setActiveView('history')}
                className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors border-b-2 ${activeView === 'history' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <History className="h-3.5 w-3.5" />
                History
              </button>
              <div className="w-px h-3.5 bg-border mx-1 shrink-0 self-center" />
              <button
                onClick={() => setActiveView('pull-requests')}
                className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors border-b-2 ${activeView === 'pull-requests' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                Pull Requests
              </button>
              <div className="w-px h-3.5 bg-border mx-1 shrink-0 self-center" />
              <button
                onClick={() => setActiveView('actions')}
                className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors border-b-2 ${activeView === 'actions' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                Actions
              </button>
            </div>
          )}
        </div>
        <div className="flex items-stretch shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {repoPath && (
            <div className="flex items-stretch">
              <button
                onClick={handleFetch}
                title="Fetch"
                className="flex items-center justify-center h-full px-3 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                tabIndex={-1}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setAutoFetch(v => !v)}
                title={autoFetch ? 'Auto-fetch on (every 15s) — click to disable' : 'Auto-fetch off — click to enable'}
                className={`flex items-center justify-center h-full px-2 text-xs font-medium transition-colors border-l border-border ${
                  autoFetch
                    ? 'text-accent hover:text-accent/80 hover:bg-secondary'
                    : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary'
                }`}
                tabIndex={-1}
              >
                Auto
              </button>
            </div>
          )}

          {/* GitHub profile */}
          <div ref={profileRef} className="relative flex items-stretch" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              title={githubUser ? githubUser.login : 'GitHub'}
              className="flex items-center gap-1.5 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              tabIndex={-1}
            >
              {githubUser
                ? <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-5 h-5 rounded-full" />
                : <Github className="h-3.5 w-3.5" />
              }
              {githubUser && <span className="text-xs">{githubUser.login}</span>}
            </button>
            {profileOpen && (
              <div className="fixed top-9 right-10 w-56 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                {githubAccounts.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-muted-foreground">Not connected to GitHub</div>
                ) : (
                  <>
                    <div className="px-3 py-1.5 border-b border-border">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Accounts</p>
                    </div>
                    {githubAccounts.map(acc => (
                      <div key={acc.login} className={`flex items-center gap-2 px-3 py-2 group ${acc.login === activeAccount ? 'bg-accent/10' : 'hover:bg-secondary/50'}`}>
                        <button onClick={() => handleSwitchAccount(acc.login)} className="flex items-center gap-2 flex-1 min-w-0">
                          <img src={acc.avatarUrl} alt={acc.login} className="w-5 h-5 rounded-full shrink-0" />
                          <span className={`text-xs truncate ${acc.login === activeAccount ? 'text-accent font-medium' : 'text-foreground'}`}>{acc.login}</span>
                          {acc.login === activeAccount && <span className="ml-auto text-[9px] text-accent shrink-0">active</span>}
                        </button>
                        <button
                          onClick={() => handleRemoveAccount(acc.login)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                          title="Remove account"
                        >
                          <LogOut className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
                <div className="border-t border-border">
                  <button
                    onClick={handleAddAccount}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <Github className="h-3 w-3" />
                    Add account
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => window.electronAPI?.minimize()}
            className="flex items-center justify-center h-full w-9 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" tabIndex={-1}>
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => window.electronAPI?.maximize()}
            className="flex items-center justify-center h-full w-9 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" tabIndex={-1}>
            <Square className="h-3 w-3" />
          </button>
          <button onClick={() => window.electronAPI?.close()}
            className="flex items-center justify-center h-full w-9 text-muted-foreground hover:bg-[oklch(0.65_0.22_25)] hover:text-white transition-colors" tabIndex={-1}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Update bar */}
      {updateProgress !== null && (
        <UpdateBar
          progress={updateProgress}
          downloaded={updateDownloaded}
          onInstall={() => window.electronAPI?.installUpdate?.()}
          onDismiss={() => { setUpdateProgress(null); setUpdateDownloaded(false) }}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {initializing ? null : githubAccounts.length === 0 && !githubSkipped ? (
          <WelcomeScreen
            onSkip={() => setGithubSkipped(true)}
            onAuth={(user) => { handleAccountAdded(user); setGithubSkipped(true) }}
          />
        ) : repoPath ? (
          <>
            <MainPanel
              repoPath={repoPath}
              repoName={repoName}
              repoUrl={repoUrl}
              activeView={activeView}
              refreshKey={refreshKey}
              onRefresh={refresh}
              branch={branch}
              aheadBy={aheadBy}
              behindBy={behindBy}
              githubAccount={githubUser}
              branches={branches}
            />
            <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground select-none">
            <FolderOpen className="h-10 w-10 opacity-20" />
            <p className="text-sm">Open a repository to get started</p>
          </div>
        )}
      </div>

      <CloneDialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        onCloned={openRepo}
        onAuth={handleAccountAdded}
      />

      <DeviceFlowDialog
        open={addingAccount}
        onClose={() => setAddingAccount(false)}
        onAuth={handleAccountAdded}
      />

      {/* Repository switch overlay */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4 transition-opacity duration-300 pointer-events-none"
        style={{ opacity: switchingToRepo ? 1 : 0 }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">
          {switchingToRepo ? `Opening ${switchingToRepo}…` : ''}
        </p>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-2 px-3 h-7 border-t border-border bg-card shrink-0 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title="Appearance settings"
            className={`flex items-center gap-1.5 px-2 h-5 rounded text-xs transition-colors ${
              settingsOpen
                ? 'text-foreground bg-accent/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            <span>Appearance</span>
          </button>
          <span className="text-xs text-muted-foreground/40 select-none">v{version}</span>
        </div>
      </div>
    </div>
  )
}
