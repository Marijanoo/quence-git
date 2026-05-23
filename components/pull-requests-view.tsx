'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  GitMerge, GitPullRequest, GitPullRequestClosed, Circle,
  ExternalLink, MessageSquare, ChevronDown, Check, X,
  Loader2, AlertCircle, Minus, Plus, FileCode, RefreshCw,
  GitBranch, User, Clock, FileEdit, FilePlus, FileMinus,
} from 'lucide-react'
import { toast } from 'sonner'
import { DiffRenderer, parseDiff } from '@/components/diff-renderer'

// ── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function prStatusColor(pr: GitHubPR): string {
  if (pr.merged) return '#CCA8FF'
  if (pr.state === 'closed') return '#e06c75'
  if (pr.draft) return 'var(--muted-foreground)'
  return '#4ec94e'
}

function PRIcon({ pr, size = 14 }: { pr: GitHubPR; size?: number }) {
  const color = prStatusColor(pr)
  if (pr.merged) return <GitMerge style={{ width: size, height: size, color, flexShrink: 0 }} />
  if (pr.state === 'closed') return <GitPullRequestClosed style={{ width: size, height: size, color, flexShrink: 0 }} />
  if (pr.draft) return <Circle style={{ width: size, height: size, color, flexShrink: 0 }} />
  return <GitPullRequest style={{ width: size, height: size, color, flexShrink: 0 }} />
}

// ── types ─────────────────────────────────────────────────────────────────────

interface PullRequestsViewProps {
  repoPath: string
  repoUrl: string
  branch: string
  githubAccount?: GitHubAccount | null
  branches: GitBranch[]
}

type FilterState = 'open' | 'closed' | 'all'
type DetailTab = 'overview' | 'files' | 'comments'

// ── main component ────────────────────────────────────────────────────────────

export function PullRequestsView({ repoPath, repoUrl, branch, githubAccount, branches }: PullRequestsViewProps) {
  const [filter, setFilter] = useState<FilterState>('open')
  const [prs, setPrs] = useState<GitHubPR[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null)
  const [creatingPR, setCreatingPR] = useState(false)

  const token = githubAccount?.token ?? ''

  const loadPRs = useCallback(async (state: FilterState = filter) => {
    if (!token || !repoUrl) return
    setLoading(true)
    const r = await window.electronAPI?.github.listPrs(token, repoUrl, state)
    setLoading(false)
    if (r?.ok) {
      setPrs(r.prs)
      const branchPR = r.prs.find(pr => pr.head.ref === branch)
      if (branchPR && !selectedPR) setSelectedPR(branchPR)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, repoUrl, filter, branch])

  useEffect(() => {
    loadPRs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, repoUrl, filter])

  const openCount = prs.filter(p => p.state === 'open' && !p.merged).length
  const closedCount = prs.filter(p => p.state === 'closed' || p.merged).length

  if (!repoUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
        <GitPullRequest className="h-8 w-8 opacity-20" />
        <p className="text-xs">Connect to GitHub to view pull requests</p>
      </div>
    )
  }

  if (!githubAccount) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
        <GitPullRequest className="h-8 w-8 opacity-20" />
        <p className="text-xs">Sign in to GitHub to view pull requests</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Left panel — PR list */}
      <div className="w-72 flex flex-col border-r border-border shrink-0">
        {/* Header row: title + counts + refresh */}
        <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {loading ? 'Pull Requests' : `Pull Requests (${prs.length})`}
          </span>
          <button
            onClick={() => loadPRs()}
            disabled={loading}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        {/* Filter + New row */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
          {(['open', 'closed', 'all'] as FilterState[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex items-center gap-1 px-2 h-6 rounded text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              <span className="capitalize">{s}</span>
              {s === 'open' && openCount > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${filter === s ? 'bg-accent/20' : 'bg-secondary'}`}>{openCount}</span>
              )}
              {s === 'closed' && closedCount > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${filter === s ? 'bg-accent/20' : 'bg-secondary'}`}>{closedCount}</span>
              )}
            </button>
          ))}
          <button
            onClick={() => { setSelectedPR(null); setCreatingPR(true) }}
            className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors ml-auto"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>

        {/* PR list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && prs.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : prs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground/50">No pull requests</p>
          ) : (
            prs.map(pr => (
              <PRListItem
                key={pr.number}
                pr={pr}
                selected={selectedPR?.number === pr.number && !creatingPR}
                currentBranch={branch}
                onSelect={() => { setSelectedPR(pr); setCreatingPR(false) }}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {creatingPR ? (
          <CreatePRPanel
            repoPath={repoPath}
            repoUrl={repoUrl}
            branch={branch}
            token={token}
            branches={branches}
            onCancel={() => setCreatingPR(false)}
            onCreated={async (number) => {
              setCreatingPR(false)
              await loadPRs('open')
              const created = prs.find(p => p.number === number)
              if (created) setSelectedPR(created)
            }}
          />
        ) : selectedPR ? (
          <PRDetail
            key={selectedPR.number}
            pr={selectedPR}
            repoPath={repoPath}
            repoUrl={repoUrl}
            branch={branch}
            token={token}
            githubAccount={githubAccount}
            onRefresh={async () => {
              await loadPRs()
              const r = await window.electronAPI?.github.getPr(token, repoUrl, selectedPR.number)
              if (r?.ok && r.pr) setSelectedPR(r.pr)
            }}
            onBranchChange={() => loadPRs()}
          />
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
            <GitPullRequest className="h-8 w-8 opacity-20" />
            <p className="text-xs">Select a pull request</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PR list item ──────────────────────────────────────────────────────────────

function PRListItem({ pr, selected, currentBranch, onSelect }: {
  pr: GitHubPR
  selected: boolean
  currentBranch: string
  onSelect: () => void
}) {
  const isCurrentBranch = pr.head.ref === currentBranch
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-border/40 transition-colors ${
        selected ? 'bg-accent/10' : 'hover:bg-secondary/40'
      }`}
    >
      <div className="pt-0.5 shrink-0">
        <PRIcon pr={pr} size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-relaxed truncate">{pr.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground/60 font-mono">#{pr.number}</span>
          {isCurrentBranch && (
            <span className="text-[9px] bg-accent/20 text-accent px-1 rounded">current</span>
          )}
          {pr.draft && (
            <span className="text-[9px] bg-secondary text-muted-foreground px-1 rounded">draft</span>
          )}
          {pr.labels.slice(0, 2).map(label => (
            <span
              key={label.name}
              className="text-[9px] px-1 rounded font-medium"
              style={{ background: `#${label.color}25`, color: `#${label.color}` }}
            >
              {label.name}
            </span>
          ))}
          <span className="text-xs text-muted-foreground/40 ml-auto shrink-0">{relativeTime(pr.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <img src={pr.author.avatarUrl} alt={pr.author.login} className="w-3 h-3 rounded-full" />
          <span className="text-xs text-muted-foreground/50 truncate">{pr.author.login}</span>
          {pr.comments > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground/40 ml-auto">
              <MessageSquare className="h-2.5 w-2.5" />{pr.comments}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── PR Detail ─────────────────────────────────────────────────────────────────

function PRDetail({ pr, repoPath, repoUrl, branch, token, githubAccount, onRefresh, onBranchChange }: {
  pr: GitHubPR
  repoPath: string
  repoUrl: string
  branch: string
  token: string
  githubAccount: GitHubAccount
  onRefresh: () => Promise<void>
  onBranchChange: () => void
}) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [mergeOpen, setMergeOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const mergeRef = useRef<HTMLDivElement>(null)

  const isOnBranch = branch === pr.head.ref
  const canMerge = pr.state === 'open' && !pr.draft && pr.mergeable !== false

  useEffect(() => {
    if (!mergeOpen) return
    function handler(e: MouseEvent) {
      if (mergeRef.current && !mergeRef.current.contains(e.target as Node)) setMergeOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [mergeOpen])

  async function handleCheckout() {
    setActionLoading(true)
    const r = await window.electronAPI?.git.checkout(repoPath, pr.head.ref)
    setActionLoading(false)
    if (r?.ok) { toast.success(`Checked out ${pr.head.ref}`); onBranchChange() }
    else toast.error(r?.stderr ?? 'Checkout failed')
  }

  async function handleMerge(method: 'merge' | 'squash' | 'rebase') {
    setMergeOpen(false)
    setActionLoading(true)
    const r = await window.electronAPI?.github.mergePr(token, repoUrl, pr.number, method)
    setActionLoading(false)
    if (r?.ok) { toast.success('Pull request merged'); await onRefresh() }
    else toast.error('Merge failed')
  }

  async function handleClose() {
    setActionLoading(true)
    const r = await window.electronAPI?.github.closePr(token, repoUrl, pr.number)
    setActionLoading(false)
    if (r?.ok) { toast.success('Pull request closed'); await onRefresh() }
    else toast.error('Failed to close PR')
  }

  async function handleReopen() {
    setActionLoading(true)
    const r = await window.electronAPI?.github.reopenPr(token, repoUrl, pr.number)
    setActionLoading(false)
    if (r?.ok) { toast.success('Pull request reopened'); await onRefresh() }
    else toast.error('Failed to reopen PR')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* PR metadata header — matches history-view commit metadata style */}
      <div className="px-3 py-3 border-b border-border bg-card shrink-0 space-y-2">
        <div className="flex items-start gap-2">
          <PRIcon pr={pr} size={13} />
          <p className="text-xs font-semibold text-foreground leading-relaxed flex-1 min-w-0">{pr.title}</p>
          {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <img src={pr.author.avatarUrl} alt={pr.author.login} className="w-3.5 h-3.5 rounded-full" />
            <span className="truncate">{pr.author.login}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{relativeTime(pr.createdAt)}</span>
            <span className="text-muted-foreground/40 font-mono ml-1">#{pr.number}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            <code className="text-accent bg-accent/10 px-1 rounded text-[10px]">{pr.head.ref}</code>
            <span className="text-muted-foreground/40">→</span>
            <code className="bg-secondary px-1 rounded text-[10px]">{pr.base.ref}</code>
          </div>
        </div>

        {/* Status + action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <PRStatusChip pr={pr} />

          <button
            onClick={() => window.electronAPI?.github.openAuthUrl(pr.htmlUrl)}
            className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </button>

          {!isOnBranch && (
            <button
              onClick={handleCheckout}
              disabled={actionLoading}
              className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-40"
            >
              <GitBranch className="h-3 w-3" />
              Checkout
            </button>
          )}

          {canMerge && (
            <div ref={mergeRef} className="relative flex items-stretch">
              <button
                onClick={() => handleMerge('merge')}
                disabled={actionLoading}
                className="flex items-center gap-1 px-2 h-6 rounded-l text-xs text-foreground bg-[#4ec94e]/20 hover:bg-[#4ec94e]/30 border border-[#4ec94e]/30 border-r-0 transition-colors disabled:opacity-40"
              >
                <GitMerge className="h-3 w-3 text-[#4ec94e]" />
                Merge
              </button>
              <button
                onClick={() => setMergeOpen(o => !o)}
                disabled={actionLoading}
                className="flex items-center px-1 h-6 rounded-r text-xs bg-[#4ec94e]/20 hover:bg-[#4ec94e]/30 border border-[#4ec94e]/30 transition-colors disabled:opacity-40"
              >
                <ChevronDown className="h-3 w-3 text-[#4ec94e]" />
              </button>
              {mergeOpen && (
                <div className="absolute top-7 left-0 w-44 bg-popover border border-border rounded shadow-xl z-20 overflow-hidden">
                  {(['merge', 'squash', 'rebase'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => handleMerge(m)}
                      className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/40 transition-colors border-b border-border/40 last:border-0"
                    >
                      {m === 'merge' && 'Merge commit'}
                      {m === 'squash' && 'Squash and merge'}
                      {m === 'rebase' && 'Rebase and merge'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {pr.state === 'open' && !pr.merged && (
            <button
              onClick={handleClose}
              disabled={actionLoading}
              className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-[#e06c75] hover:bg-secondary/40 transition-colors disabled:opacity-40"
            >
              <X className="h-3 w-3" />
              Close
            </button>
          )}

          {pr.state === 'closed' && !pr.merged && (
            <button
              onClick={handleReopen}
              disabled={actionLoading}
              className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-[#4ec94e] hover:bg-secondary/40 transition-colors disabled:opacity-40"
            >
              <GitPullRequest className="h-3 w-3" />
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Tab bar — matches history-view file list header style */}
      <div className="shrink-0 flex items-stretch border-b border-border bg-card px-3 gap-0.5">
        {(['overview', 'files', 'comments'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 h-8 text-xs font-medium transition-colors border-b-2 ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'overview' && 'Overview'}
            {t === 'files' && 'Files changed'}
            {t === 'comments' && 'Comments'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'overview' && <OverviewTab pr={pr} token={token} repoUrl={repoUrl} />}
        {tab === 'files' && <FilesTab pr={pr} token={token} repoUrl={repoUrl} />}
        {tab === 'comments' && <CommentsTab pr={pr} token={token} repoUrl={repoUrl} githubAccount={githubAccount} />}
      </div>
    </div>
  )
}

function PRStatusChip({ pr }: { pr: GitHubPR }) {
  if (pr.merged) return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-accent/15 text-accent">
      <GitMerge className="h-2.5 w-2.5" /> Merged
    </span>
  )
  if (pr.state === 'closed') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-[#e06c75]/15 text-[#e06c75]">
      <GitPullRequestClosed className="h-2.5 w-2.5" /> Closed
    </span>
  )
  if (pr.draft) return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-secondary text-muted-foreground">
      <Circle className="h-2.5 w-2.5" /> Draft
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-[#4ec94e]/15 text-[#4ec94e]">
      <GitPullRequest className="h-2.5 w-2.5" /> Open
    </span>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ pr, token, repoUrl }: { pr: GitHubPR; token: string; repoUrl: string }) {
  const [detail, setDetail] = useState<GitHubPR | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const r = await window.electronAPI?.github.getPr(token, repoUrl, pr.number)
      if (!cancelled && r?.ok && r.pr) setDetail(r.pr)
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [pr.number, token, repoUrl])

  const data = detail ?? pr

  return (
    <div className="h-full overflow-y-auto">
      {/* Description */}
      <div className="px-3 py-2.5 border-b border-border/40">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Description</p>
        {data.body ? (
          <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{data.body}</pre>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic">No description provided</p>
        )}
      </div>

      {/* Merge status */}
      {data.state === 'open' && !loading && <MergeStatusRow pr={data} />}

      {/* CI checks */}
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading checks…
        </div>
      ) : data.checkRuns && data.checkRuns.length > 0 ? (
        <>
          <div className="flex items-center justify-between px-3 h-7 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">Checks ({data.checkRuns.length})</span>
          </div>
          {data.checkRuns.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/40">
              <CheckIcon status={c.status} conclusion={c.conclusion} />
              <span className="text-xs text-foreground flex-1 min-w-0 truncate">{c.name}</span>
              <a
                href={c.htmlUrl}
                onClick={e => { e.preventDefault(); window.electronAPI?.github.openAuthUrl(c.htmlUrl) }}
                className="text-[10px] text-muted-foreground/50 hover:text-accent transition-colors"
              >
                Details
              </a>
            </div>
          ))}
        </>
      ) : null}

      {/* Reviews */}
      {!loading && data.reviews && data.reviews.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 h-7 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">Reviews ({data.reviews.length})</span>
          </div>
          {data.reviews.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/40">
              <ReviewIcon state={r.state} />
              <span className="text-xs text-foreground">{r.author}</span>
              <span className="text-xs text-muted-foreground/40 ml-auto">{relativeTime(r.submittedAt)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function MergeStatusRow({ pr }: { pr: GitHubPR }) {
  if (pr.mergeable === false) return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#e06c75]" />
      <span className="text-xs text-[#e06c75]">Merge conflicts detected</span>
    </div>
  )
  if (pr.mergeable === true) return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
      <Check className="h-3.5 w-3.5 shrink-0 text-[#4ec94e]" />
      <span className="text-xs text-[#4ec94e]">No conflicts with base branch</span>
    </div>
  )
  return null
}

function CheckIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status !== 'completed') return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />
  if (conclusion === 'success') return <Check className="h-3.5 w-3.5 text-[#4ec94e]" />
  if (conclusion === 'failure' || conclusion === 'cancelled') return <X className="h-3.5 w-3.5 text-[#e06c75]" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function ReviewIcon({ state }: { state: string }) {
  if (state === 'APPROVED') return <Check className="h-3.5 w-3.5 text-[#4ec94e]" />
  if (state === 'CHANGES_REQUESTED') return <X className="h-3.5 w-3.5 text-[#e06c75]" />
  return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
}

// ── Files changed tab ─────────────────────────────────────────────────────────

function FilesTab({ pr, token, repoUrl }: { pr: GitHubPR; token: string; repoUrl: string }) {
  const [files, setFiles] = useState<GitHubPRFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<GitHubPRFile | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const r = await window.electronAPI?.github.getPrDiff(token, repoUrl, pr.number)
      if (!cancelled) {
        if (r?.ok) { setFiles(r.files); if (r.files.length > 0) setSelectedFile(r.files[0]) }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [pr.number, token, repoUrl])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading files…
      </div>
    )
  }

  if (files.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground/50">No file changes</p>
  }

  return (
    <div className="h-full flex min-h-0">
      {/* File list — matches history-view changed files panel */}
      <div className="w-64 flex flex-col border-r border-border shrink-0">
        <div className="flex items-center justify-between px-3 h-7 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">Files ({files.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {files.map(f => {
            const filename = f.filename.split('/').pop() ?? f.filename
            const dir = f.filename.includes('/') ? f.filename.substring(0, f.filename.lastIndexOf('/')) : ''
            return (
              <button
                key={f.filename}
                onClick={() => setSelectedFile(f)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors border-b border-border/40 last:border-0 ${
                  selectedFile?.filename === f.filename ? 'bg-accent/10' : 'hover:bg-secondary/40'
                }`}
              >
                {f.status === 'added' ? <FilePlus className="h-3.5 w-3.5 text-[#4ec94e] shrink-0" />
                  : f.status === 'removed' || f.status === 'deleted' ? <FileMinus className="h-3.5 w-3.5 text-[#e06c75] shrink-0" />
                  : <FileEdit className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground truncate block">{filename}</span>
                  {dir && <span className="text-xs text-muted-foreground/40 truncate block">{dir}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] text-[#4ec94e]">+{f.additions}</span>
                  <span className="text-[9px] text-[#e06c75]">-{f.deletions}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Diff — matches history-view CommitFileDiff style */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {selectedFile ? (
          <>
            <div className="flex items-center gap-2 px-3 h-8 border-b border-border bg-card shrink-0">
              <span className="text-xs font-medium text-foreground">{selectedFile.filename.split('/').pop()}</span>
              <span className="text-xs text-muted-foreground/60 truncate">{selectedFile.filename}</span>
            </div>
            <div className="flex-1 overflow-auto min-h-0" style={{ background: '#282c34' }}>
              {selectedFile.patch ? (
                <DiffRenderer lines={parseDiff(buildPatchDiff(selectedFile))} filePath={selectedFile.filename} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground/50">No diff available</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/50">Select a file to view diff</p>
          </div>
        )}
      </div>
    </div>
  )
}

function buildPatchDiff(file: GitHubPRFile): string {
  const lines = [
    `diff --git a/${file.filename} b/${file.filename}`,
    file.status === 'added' ? 'new file mode 100644' : '',
    file.status === 'deleted' ? 'deleted file mode 100644' : '',
    `--- ${file.status === 'added' ? '/dev/null' : `a/${file.filename}`}`,
    `+++ ${file.status === 'deleted' ? '/dev/null' : `b/${file.filename}`}`,
    file.patch,
  ].filter(Boolean)
  return lines.join('\n')
}

// ── Comments tab ──────────────────────────────────────────────────────────────

function CommentsTab({ pr, token, repoUrl, githubAccount }: {
  pr: GitHubPR
  token: string
  repoUrl: string
  githubAccount: GitHubAccount
}) {
  const [comments, setComments] = useState<GitHubComment[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadComments = useCallback(async () => {
    setLoading(true)
    const r = await window.electronAPI?.github.getPrComments(token, repoUrl, pr.number)
    if (r?.ok) setComments(r.comments)
    setLoading(false)
  }, [token, repoUrl, pr.number])

  useEffect(() => { loadComments() }, [loadComments])

  async function handleSubmit() {
    if (!body.trim()) return
    setSubmitting(true)
    const r = await window.electronAPI?.github.addComment(token, repoUrl, pr.number, body.trim())
    setSubmitting(false)
    if (r?.ok) { setBody(''); toast.success('Comment added'); await loadComments() }
    else toast.error('Failed to add comment')
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : comments.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground/50">No comments yet</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="flex gap-2.5 px-3 py-2.5 border-b border-border/40">
              <img src={c.author.avatarUrl} alt={c.author.login} className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">{c.author.login}</span>
                  <span className="text-xs text-muted-foreground/40">{relativeTime(c.createdAt)}</span>
                </div>
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{c.body}</pre>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose box */}
      <div className="shrink-0 border-t border-border p-3 bg-card">
        <div className="flex items-start gap-2">
          <img src={githubAccount.avatarUrl} alt={githubAccount.login} className="w-5 h-5 rounded-full shrink-0 mt-1" />
          <div className="flex-1 flex flex-col gap-2">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Leave a comment…"
              rows={3}
              className="w-full px-2 py-1.5 text-xs bg-input border border-border rounded outline-none focus:border-accent/50 text-foreground placeholder:text-muted-foreground/40 resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!body.trim() || submitting}
                className="flex items-center gap-1.5 px-3 h-6 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create PR panel ───────────────────────────────────────────────────────────

function CreatePRPanel({ repoPath, repoUrl, branch, token, branches, onCancel, onCreated }: {
  repoPath: string
  repoUrl: string
  branch: string
  token: string
  branches: GitBranch[]
  onCancel: () => void
  onCreated: (number: number) => Promise<void>
}) {
  const localBranches = branches.filter(b => !b.name.startsWith('remotes/'))
  const defaultBase = localBranches.find(b => b.name === 'main' || b.name === 'master')?.name
    ?? localBranches.find(b => b.name !== branch)?.name
    ?? ''

  const [head, setHead] = useState(branch)
  const [base, setBase] = useState(defaultBase)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function loadLastCommit() {
      const r = await window.electronAPI?.git.log(repoPath, 1)
      if (r?.ok && r.commits.length > 0) setTitle(r.commits[0].message)
    }
    loadLastCommit()
  }, [repoPath, head])

  const valid = head !== base && title.trim().length > 0

  async function handleCreate(asDraft: boolean) {
    if (!valid) return
    setCreating(true)
    const r = await window.electronAPI?.github.createPr(token, repoUrl, title.trim(), body, head, base, asDraft)
    setCreating(false)
    if (r?.ok && r.number) { toast.success(`Pull request #${r.number} created`); await onCreated(r.number) }
    else toast.error(r?.error ?? 'Failed to create pull request')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — matches history/changes section header style */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-border bg-card shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">New Pull Request</span>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Branch selectors */}
        <div className="px-3 py-3 border-b border-border/40 space-y-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Branches</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">Choose where your changes come from and where they should go.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-muted-foreground/60">
                Your changes <span className="text-muted-foreground/30">(head)</span>
              </label>
              <select
                value={head}
                onChange={e => setHead(e.target.value)}
                className="w-full h-7 px-2 text-xs bg-input border border-border rounded outline-none focus:border-accent/50 text-foreground"
              >
                {localBranches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground/40">The branch with your new work</p>
            </div>
            <GitMerge className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-3" />
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-muted-foreground/60">
                Merge into <span className="text-muted-foreground/30">(base)</span>
              </label>
              <select
                value={base}
                onChange={e => setBase(e.target.value)}
                className="w-full h-7 px-2 text-xs bg-input border border-border rounded outline-none focus:border-accent/50 text-foreground"
              >
                {localBranches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground/40">Usually <span className="font-mono">main</span> or <span className="font-mono">master</span></p>
            </div>
          </div>
          {head === base && (
            <p className="text-xs text-[#e06c75] flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              These must be two different branches
            </p>
          )}
        </div>

        {/* Title */}
        <div className="px-3 py-3 border-b border-border/40 space-y-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              Title <span className="text-[#e06c75]">*</span>
            </label>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">A short summary of what you changed — teammates will see this in the list.</p>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Add dark mode support"
            className="w-full h-7 px-2 text-xs bg-input border border-border rounded outline-none focus:border-accent/50 text-foreground placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Description */}
        <div className="px-3 py-3 border-b border-border/40 space-y-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Optional but helpful — explain why you made these changes, what to test, or anything reviewers should know.</p>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="e.g. This adds a toggle in Settings that switches between light and dark theme. Tested on Chrome and Firefox."
            rows={5}
            className="w-full px-2 py-1.5 text-xs bg-input border border-border rounded outline-none focus:border-accent/50 text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed"
          />
        </div>

        {/* Draft toggle */}
        <div className="px-3 py-3 border-b border-border/40">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setDraft(d => !d)}
              className={`relative w-8 h-4 rounded-full transition-colors shrink-0 mt-0.5 ${draft ? 'bg-accent/50' : 'bg-secondary border border-border'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${draft ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <div>
              <span className="text-xs text-foreground">Mark as draft</span>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Use this when your work isn't finished yet. Drafts can't be merged — they signal to teammates that the PR is still a work in progress.</p>
            </div>
          </label>
        </div>

        {/* Buttons */}
        <div className="px-3 py-3 flex items-center gap-2">
          <button
            onClick={() => handleCreate(false)}
            disabled={!valid || creating}
            className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
            Create Pull Request
          </button>
          <button
            onClick={() => handleCreate(true)}
            disabled={!valid || creating}
            className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-3 w-3" />}
            Create Draft
          </button>
        </div>
      </div>
    </div>
  )
}
