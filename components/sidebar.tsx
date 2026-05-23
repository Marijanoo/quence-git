'use client'

import { useEffect, useState, useCallback } from 'react'
import { GitCommitHorizontal, GitBranch, History, Server, ChevronDown, ChevronRight, Check, Plus, Trash2 } from 'lucide-react'
import type { ActiveView } from '@/app/page'
import { toast } from 'sonner'

interface SidebarProps {
  repoPath: string
  activeView: ActiveView
  onViewChange: (v: ActiveView) => void
  onOpenRepo: (path: string) => void
  refreshKey: number
  onRefresh: () => void
}

export function Sidebar({ repoPath, activeView, onViewChange, onOpenRepo, refreshKey, onRefresh }: SidebarProps) {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([])
  const [branchesOpen, setBranchesOpen] = useState(true)
  const [remotesOpen, setRemotesOpen] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)

  const loadData = useCallback(async () => {
    const [branchRes, remotesRes] = await Promise.all([
      window.electronAPI?.git.branches(repoPath),
      window.electronAPI?.git.remotes(repoPath),
    ])
    if (branchRes?.ok) {
      setBranches(branchRes.branches)
      setCurrentBranch(branchRes.current)
    }
    if (remotesRes?.ok) setRemotes(remotesRes.remotes)
  }, [repoPath])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  async function handleCheckout(branch: string) {
    if (branch === currentBranch) return
    const r = await window.electronAPI?.git.checkout(repoPath, branch)
    if (r?.ok) { toast.success(`Switched to ${branch}`); onRefresh() }
    else toast.error(r?.stderr ?? 'Checkout failed')
  }

  async function handleCreateBranch() {
    if (!newBranch.trim()) return
    setCreatingBranch(false)
    const r = await window.electronAPI?.git.checkout(repoPath, newBranch.trim(), true)
    if (r?.ok) { toast.success(`Created branch ${newBranch}`); setNewBranch(''); onRefresh() }
    else toast.error(r?.stderr ?? 'Failed to create branch')
  }

  async function handleDeleteBranch(branch: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (branch === currentBranch) { toast.error("Can't delete current branch"); return }
    const r = await window.electronAPI?.git.deleteBranch(repoPath, branch)
    if (r?.ok) { toast.success(`Deleted ${branch}`); onRefresh() }
    else toast.error(r?.stderr ?? 'Delete failed')
  }

  const repoName = repoPath.split(/[/\\]/).pop() ?? repoPath

  return (
    <div className="w-56 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Nav tabs */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => onViewChange('changes')}
          className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'changes'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          Changes
        </button>
        <button
          onClick={() => onViewChange('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'history'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Branches */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => setBranchesOpen(o => !o)}
              className="flex-1 flex items-center gap-1.5 px-3 h-7 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {branchesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <GitBranch className="h-3 w-3" />
              Branches
            </button>
            <button
              onClick={() => setCreatingBranch(o => !o)}
              className="px-2 h-7 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title="New branch"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {creatingBranch && (
            <div className="px-3 pb-1">
              <input
                autoFocus
                value={newBranch}
                onChange={e => setNewBranch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setCreatingBranch(false) }}
                placeholder="New branch name…"
                className="w-full h-6 px-2 rounded text-xs bg-input border border-border outline-none focus:border-accent/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          )}
          {branchesOpen && (
            <div className="pb-1">
              {branches.filter(b => !b.name.startsWith('remotes/')).map(b => (
                <div
                  key={b.name}
                  onClick={() => handleCheckout(b.name)}
                  className={`w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors group cursor-pointer ${
                    b.current ? 'text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  {b.current
                    ? <Check className="h-3 w-3 shrink-0 text-accent" />
                    : <span className="w-3 shrink-0" />
                  }
                  <span className="text-xs truncate flex-1">{b.name}</span>
                  {!b.current && (
                    <button
                      onClick={(e) => handleDeleteBranch(b.name, e)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remotes */}
        <div>
          <button
            onClick={() => setRemotesOpen(o => !o)}
            className="w-full flex items-center gap-1.5 px-3 h-7 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {remotesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Server className="h-3 w-3" />
            Remotes
          </button>
          {remotesOpen && (
            <div className="pb-1">
              {remotes.length === 0 ? (
                <p className="px-4 py-1.5 text-xs text-muted-foreground/50">No remotes</p>
              ) : (
                remotes.map(r => (
                  <div key={r.name} className="flex flex-col px-4 py-1.5">
                    <span className="text-xs text-foreground font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground/60 truncate">{r.url}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Placeholders */}
        <div className="border-t border-border mt-1 pt-1">
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-muted-foreground/40">
            <span className="text-xs">Pull Requests</span>
            <span className="text-xs bg-secondary/50 px-1 rounded">soon</span>
          </div>
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-muted-foreground/40">
            <span className="text-xs">Issues</span>
            <span className="text-xs bg-secondary/50 px-1 rounded">soon</span>
          </div>
        </div>
      </div>
    </div>
  )
}
