'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, GitBranch, FolderOpen, Github, Lock, Globe, Search, LogOut, Loader2, ChevronRight, Copy, Check as CheckIcon } from 'lucide-react'
import { toast } from 'sonner'

interface CloneDialogProps {
  open: boolean
  onClose: () => void
  onCloned: (path: string) => void
  onAuth?: (user: GitHubAccount) => void
}

type Tab = 'url' | 'github'

type AuthState =
  | { status: 'idle' }
  | { status: 'polling'; userCode: string; verificationUri: string; deviceCode: string; interval: number }
  | { status: 'authed'; token: string; login: string; avatarUrl: string }

function RepoRow({ repo, selected, onSelect }: { repo: GitHubRepo; selected: boolean; onSelect: (r: GitHubRepo) => void }) {
  return (
    <div
      onClick={() => onSelect(repo)}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/50 cursor-pointer transition-colors ${selected ? 'bg-accent/10' : 'hover:bg-secondary/50'}`}
    >
      {repo.private
        ? <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        : <Globe className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{repo.full_name}</p>
        {repo.description && (
          <p className="text-xs text-muted-foreground/70 truncate">{repo.description}</p>
        )}
      </div>
      {selected && <ChevronRight className="h-3.5 w-3.5 text-accent shrink-0" />}
    </div>
  )
}

function PollingView({ userCode, verificationUri }: { userCode: string; verificationUri: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Loader2 className="h-8 w-8 text-accent animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Waiting for authorization</p>
        <p className="text-xs text-muted-foreground mt-1">Enter this code in your browser:</p>
      </div>
      <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-5 py-3">
        <span className="text-xl font-mono font-bold tracking-widest text-accent">{userCode}</span>
        <button
          onClick={handleCopy}
          title="Copy code"
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <button
        onClick={() => window.electronAPI?.github.openAuthUrl(verificationUri)}
        className="text-xs text-accent hover:underline"
      >
        Open {verificationUri}
      </button>
    </div>
  )
}

export function CloneDialog({ open, onClose, onCloned, onAuth }: CloneDialogProps) {
  const [tab, setTab] = useState<Tab>('url')

  // URL tab state
  const [url, setUrl] = useState('')
  const [dest, setDest] = useState('')
  const [progress, setProgress] = useState('')
  const [cloning, setCloning] = useState(false)

  // GitHub tab state
  const [auth, setAuth] = useState<AuthState>({ status: 'idle' })
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [ghDest, setGhDest] = useState('')

  // Restore token from store on open
  useEffect(() => {
    if (!open) return
    window.electronAPI?.store.get('github-token').then(async (t) => {
      if (!t || typeof t !== 'string') return
      const r = await window.electronAPI?.github.getUser(t)
      if (r?.ok && r.user) {
        setAuth({ status: 'authed', token: t, login: r.user.login, avatarUrl: r.user.avatar_url })
        loadRepos(t)
      }
    })
  }, [open])

  async function loadRepos(token: string) {
    setReposLoading(true)
    const r = await window.electronAPI?.github.listRepos(token)
    setReposLoading(false)
    if (r?.ok && r.repos) setRepos(r.repos)
    else toast.error('Failed to load repositories')
  }

  async function handleLogin() {
    const r = await window.electronAPI?.github.deviceFlowStart()
    if (!r?.ok) { toast.error(`GitHub auth failed${(r as any)?.error ? `: ${(r as any).error}` : ''}`); return }
    const verificationUri = r.verification_uri ?? ''
    if (!verificationUri) { toast.error('GitHub auth failed: no verification URI'); return }
    setAuth({ status: 'polling', userCode: r.user_code, verificationUri, deviceCode: r.device_code, interval: r.interval })
    window.electronAPI?.github.openAuthUrl(verificationUri)
    poll(r.device_code, r.interval)
  }

  async function poll(deviceCode: string, interval: number) {
    for (let i = 0; i < 60; i++) {
      const r = await window.electronAPI?.github.deviceFlowPoll(deviceCode, interval)
      if (r?.ok && r.token) {
        const userRes = await window.electronAPI?.github.getUser(r.token)
        if (userRes?.ok && userRes.user) {
          const authedUser: GitHubAccount = { login: userRes.user.login, name: userRes.user.name ?? userRes.user.login, email: userRes.user.email ?? '', avatarUrl: userRes.user.avatar_url, token: r.token }
          setAuth({ status: 'authed', token: r.token, login: authedUser.login, avatarUrl: authedUser.avatarUrl })
          onAuth?.(authedUser)
          loadRepos(r.token)
          return
        }
      }
      if (r?.error && r.error !== 'authorization_pending') {
        toast.error('GitHub auth expired or denied')
        setAuth({ status: 'idle' })
        return
      }
    }
    toast.error('GitHub auth timed out')
    setAuth({ status: 'idle' })
  }

  async function handleLogout() {
    await window.electronAPI?.store.delete('github-token')
    setAuth({ status: 'idle' })
    setRepos([])
    setSelectedRepo(null)
  }

  async function handlePickDest(setter: (p: string) => void) {
    const p = await window.electronAPI?.git.cloneDialog()
    if (p) setter(p)
  }

  async function handleClone(cloneUrl: string, destination: string) {
    if (!cloneUrl.trim() || !destination.trim()) return
    const repoName = cloneUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'repo'
    const finalDest = `${destination}/${repoName}`
    setCloning(true)
    setProgress('')
    window.electronAPI?.git.onCloneProgress(setProgress)
    const r = await window.electronAPI?.git.clone(cloneUrl.trim(), finalDest)
    setCloning(false)
    if (r?.ok) {
      toast.success('Repository cloned')
      onCloned(finalDest)
      onClose()
    } else {
      toast.error('Clone failed')
    }
  }

  const { ownedRepos, contributorRepos } = useMemo(() => {
    const login = auth.status === 'authed' ? auth.login.toLowerCase() : ''
    const q = search.trim().toLowerCase()
    let base = q
      ? repos.filter(r => r.full_name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
      : repos
    if (visibilityFilter === 'public') base = base.filter(r => !r.private)
    if (visibilityFilter === 'private') base = base.filter(r => r.private)
    return {
      ownedRepos: base.filter(r => r.full_name.split('/')[0].toLowerCase() === login),
      contributorRepos: base.filter(r => r.full_name.split('/')[0].toLowerCase() !== login),
    }
  }, [repos, search, visibilityFilter, auth])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg w-[520px] shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Clone repository</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setTab('url')}
            className={`flex-1 h-8 text-xs font-medium transition-colors border-b-2 ${tab === 'url' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            URL
          </button>
          <button
            onClick={() => setTab('github')}
            className={`flex-1 h-8 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${tab === 'github' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Github className="h-3 w-3" />
            GitHub
          </button>
        </div>

        {/* URL tab */}
        {tab === 'url' && (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Repository URL</label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                className="w-full h-8 px-3 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Destination folder</label>
              <div className="flex gap-2">
                <input
                  value={dest}
                  onChange={e => setDest(e.target.value)}
                  placeholder="Choose folder..."
                  className="flex-1 h-8 px-3 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  onClick={() => handlePickDest(setDest)}
                  className="h-8 px-3 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Browse
                </button>
              </div>
            </div>
            {progress && (
              <div className="bg-background rounded-md p-2 max-h-24 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{progress}</pre>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="h-8 px-4 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleClone(url, dest)}
                disabled={!url.trim() || !dest.trim() || cloning}
                className="h-8 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cloning ? 'Cloning…' : 'Clone'}
              </button>
            </div>
          </div>
        )}

        {/* GitHub tab */}
        {tab === 'github' && (
          <div className="flex flex-col flex-1 min-h-0">
            {auth.status === 'idle' && (
              <div className="flex flex-col items-center justify-center gap-4 p-8">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <Github className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Connect GitHub</p>
                  <p className="text-xs text-muted-foreground mt-1">Sign in to browse and clone your repositories</p>
                </div>
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-4 h-9 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </button>
              </div>
            )}

            {auth.status === 'polling' && (() => {
              const { userCode, verificationUri } = auth
              return (
                <PollingView userCode={userCode} verificationUri={verificationUri} />
              )
            })()}

            {auth.status === 'authed' && (
              <>
                {/* Account bar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
                  <img src={auth.avatarUrl} alt={auth.login} className="w-5 h-5 rounded-full" />
                  <span className="text-xs text-foreground font-medium flex-1">{auth.login}</span>
                  <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <LogOut className="h-3 w-3" />
                    Sign out
                  </button>
                </div>

                {/* Search + visibility filter */}
                <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
                  <div className="flex items-center gap-2 h-7 px-2 rounded-md bg-input border border-border focus-within:border-accent/50 transition-colors">
                    <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search repositories…"
                      className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(['all', 'public', 'private'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setVisibilityFilter(v)}
                        className={`px-2.5 h-5 rounded text-[10px] font-medium transition-colors capitalize ${
                          visibilityFilter === v
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repo list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {reposLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                    </div>
                  ) : ownedRepos.length === 0 && contributorRepos.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">{search ? 'No matches' : 'No repositories'}</p>
                  ) : (
                    <>
                      {ownedRepos.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 bg-muted/30 border-b border-border/50">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your repositories</span>
                          </div>
                          {ownedRepos.map(repo => <RepoRow key={repo.full_name} repo={repo} selected={selectedRepo?.full_name === repo.full_name} onSelect={setSelectedRepo} />)}
                        </>
                      )}
                      {contributorRepos.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 bg-muted/30 border-b border-border/50">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Contributor</span>
                          </div>
                          {contributorRepos.map(repo => <RepoRow key={repo.full_name} repo={repo} selected={selectedRepo?.full_name === repo.full_name} onSelect={setSelectedRepo} />)}
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Clone bar */}
                {selectedRepo && (
                  <div className="border-t border-border p-4 space-y-3 shrink-0">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Destination</label>
                      <div className="flex gap-2">
                        <input
                          value={ghDest}
                          onChange={e => setGhDest(e.target.value)}
                          placeholder="Choose folder..."
                          className="flex-1 h-8 px-3 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
                        />
                        <button
                          onClick={() => handlePickDest(setGhDest)}
                          className="h-8 px-3 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Browse
                        </button>
                      </div>
                    </div>
                    {progress && (
                      <div className="bg-background rounded-md p-2 max-h-20 overflow-y-auto">
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{progress}</pre>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate flex-1 mr-2">{selectedRepo.full_name}</span>
                      <button
                        onClick={() => handleClone(selectedRepo.clone_url, ghDest)}
                        disabled={!ghDest.trim() || cloning}
                        className="h-8 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {cloning ? 'Cloning…' : 'Clone'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
