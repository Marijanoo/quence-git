'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Loader2, Check, X, Minus, Circle, RefreshCw,
  ExternalLink, RotateCcw, ChevronDown, ChevronRight,
  GitBranch, User, Clock, Zap,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'

// ── helpers ───────────────────────────────────────────────────────────────────

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

function duration(start: string | null, end: string | null): string {
  if (!start) return ''
  const ms = new Date(end ?? new Date()).getTime() - new Date(start).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

function conclusionColor(conclusion: string | null, status: string): string {
  if (status === 'in_progress' || status === 'queued' || status === 'waiting') return 'text-yellow-400'
  if (conclusion === 'success') return 'text-[#4ec94e]'
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'text-[#e06c75]'
  if (conclusion === 'cancelled') return 'text-muted-foreground'
  if (conclusion === 'skipped') return 'text-muted-foreground/40'
  return 'text-muted-foreground'
}

// Strip ANSI escape codes from log lines
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '').replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '').replace(/\x1B[@-Z\\-_]/g, '')
}

type LogEntry =
  | { kind: 'line'; timestamp: string; content: string; lineNo: number; groupIdx: number }
  | { kind: 'group'; name: string; timestamp: string; groupIdx: number }

// Parse raw log text into entries, injecting group header rows at ##[group] markers
function parseLogEntries(raw: string): LogEntry[] {
  const entries: LogEntry[] = []
  let lineNo = 1
  let groupIdx = 0
  let currentGroup = 0
  for (const rawLine of raw.split('\n')) {
    const m = rawLine.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (.*)$/)
    const timestamp = m ? m[1] : ''
    const content = stripAnsi(m ? m[2] : rawLine).trimEnd()
    const groupMatch = content.match(/##\[group\](.*)/)
    if (groupMatch) {
      groupIdx++
      currentGroup = groupIdx
      entries.push({ kind: 'group', name: groupMatch[1].trim(), timestamp, groupIdx })
    } else if (/##\[endgroup\]/.test(content)) {
      currentGroup = 0
    } else {
      entries.push({ kind: 'line', timestamp, content, lineNo: lineNo++, groupIdx: currentGroup })
    }
  }
  return entries
}

function isRunning(status: string): boolean {
  return status === 'in_progress' || status === 'queued' || status === 'waiting'
}

// ── icons ─────────────────────────────────────────────────────────────────────

function RunIcon({ run, size = 13 }: { run: GitHubWorkflowRun; size?: number }) {
  const cls = `shrink-0 ${conclusionColor(run.conclusion, run.status)}`
  if (run.status === 'in_progress') return <Loader2 style={{ width: size, height: size }} className={`${cls} animate-spin`} />
  if (run.status === 'queued' || run.status === 'waiting') return <Circle style={{ width: size, height: size }} className={cls} />
  if (run.conclusion === 'success') return <Check style={{ width: size, height: size }} className={cls} />
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return <X style={{ width: size, height: size }} className={cls} />
  if (run.conclusion === 'cancelled') return <Minus style={{ width: size, height: size }} className={cls} />
  return <Circle style={{ width: size, height: size }} className={cls} />
}

function JobIcon({ job }: { job: GitHubWorkflowJob }) {
  const cls = `h-3.5 w-3.5 shrink-0 ${conclusionColor(job.conclusion, job.status)}`
  if (job.status === 'in_progress') return <Loader2 className={`${cls} animate-spin`} />
  if (job.status === 'queued') return <Circle className={cls} />
  if (job.conclusion === 'success') return <Check className={cls} />
  if (job.conclusion === 'failure') return <X className={cls} />
  if (job.conclusion === 'cancelled' || job.conclusion === 'skipped') return <Minus className={cls} />
  return <Circle className={cls} />
}

function StepIcon({ conclusion, status }: { conclusion: string | null; status: string }) {
  const cls = `h-3 w-3 shrink-0 ${conclusionColor(conclusion, status)}`
  if (status === 'in_progress') return <Loader2 className={`${cls} animate-spin`} />
  if (conclusion === 'success') return <Check className={cls} />
  if (conclusion === 'failure') return <X className={cls} />
  if (conclusion === 'skipped') return <Minus className={cls} />
  return <Circle className={cls} />
}

function RunStatusChip({ run }: { run: GitHubWorkflowRun }) {
  if (run.status === 'in_progress') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-yellow-400/15 text-yellow-400">
      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
    </span>
  )
  if (run.status === 'queued' || run.status === 'waiting') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-secondary text-muted-foreground">
      <Circle className="h-2.5 w-2.5" /> Queued
    </span>
  )
  if (run.conclusion === 'success') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-[#4ec94e]/15 text-[#4ec94e]">
      <Check className="h-2.5 w-2.5" /> Success
    </span>
  )
  if (run.conclusion === 'failure') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-[#e06c75]/15 text-[#e06c75]">
      <X className="h-2.5 w-2.5" /> Failed
    </span>
  )
  if (run.conclusion === 'cancelled') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-secondary text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> Cancelled
    </span>
  )
  if (run.conclusion === 'timed_out') return (
    <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-[#e06c75]/15 text-[#e06c75]">
      <X className="h-2.5 w-2.5" /> Timed out
    </span>
  )
  return null
}

// ── types ─────────────────────────────────────────────────────────────────────

interface ActionsViewProps {
  repoUrl: string
  branch: string
  githubAccount?: GitHubAccount | null
}

// ── main component ────────────────────────────────────────────────────────────

export function ActionsView({ repoUrl, branch, githubAccount }: ActionsViewProps) {
  const [runs, setRuns] = useState<GitHubWorkflowRun[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRun, setSelectedRun] = useState<GitHubWorkflowRun | null>(null)
  const [branchFilter, setBranchFilter] = useState<'all' | 'current'>('all')

  const token = githubAccount?.token ?? ''

  const loadRuns = useCallback(async () => {
    if (!token || !repoUrl) return
    setLoading(true)
    const r = await window.electronAPI?.github.listWorkflowRuns(
      token, repoUrl, branchFilter === 'current' ? branch : undefined
    )
    setLoading(false)
    if (r?.ok) {
      setRuns(r.runs)
      // keep selected run in sync with latest state
      setSelectedRun(prev => prev ? (r.runs.find(x => x.id === prev.id) ?? prev) : null)
    }
  }, [token, repoUrl, branch, branchFilter])

  useEffect(() => { loadRuns() }, [loadRuns])

  // Poll every 10s when any run is in progress
  useEffect(() => {
    if (!runs.some(r => isRunning(r.status))) return
    const id = setInterval(loadRuns, 10000)
    return () => clearInterval(id)
  }, [runs, loadRuns])

  if (!repoUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
        <Zap className="h-8 w-8 opacity-20" />
        <p className="text-xs">Connect to GitHub to view Actions</p>
      </div>
    )
  }

  if (!githubAccount) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
        <Zap className="h-8 w-8 opacity-20" />
        <p className="text-xs">Sign in to GitHub to view Actions</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Left panel — run list */}
      <div className="w-72 flex flex-col border-r border-border shrink-0">
        <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {loading ? 'Actions' : `Actions (${runs.length})`}
          </span>
          <button
            onClick={loadRuns}
            disabled={loading}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
          {(['all', 'current'] as const).map(f => (
            <button
              key={f}
              onClick={() => setBranchFilter(f)}
              className={`flex items-center gap-1 px-2 h-6 rounded text-xs font-medium transition-colors ${
                branchFilter === f
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              {f === 'all' ? 'All branches' : 'Current branch'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && runs.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : runs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground/50">No workflow runs</p>
          ) : (
            runs.map(run => (
              <RunListItem
                key={run.id}
                run={run}
                selected={selectedRun?.id === run.id}
                onSelect={() => setSelectedRun(run)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {selectedRun ? (
          <RunDetail
            key={selectedRun.id}
            run={selectedRun}
            repoUrl={repoUrl}
            token={token}
            onRerun={async () => {
              const r = await window.electronAPI?.github.rerunWorkflow(token, repoUrl, selectedRun.id)
              if (r?.ok) { toast.success('Workflow re-run triggered'); setTimeout(loadRuns, 2000) }
              else toast.error('Failed to re-run workflow')
            }}
          />
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
            <Zap className="h-8 w-8 opacity-20" />
            <p className="text-xs">Select a run to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Run list item ─────────────────────────────────────────────────────────────

function RunListItem({ run, selected, onSelect }: {
  run: GitHubWorkflowRun
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-border/40 transition-colors ${
        selected ? 'bg-accent/10' : 'hover:bg-secondary/40'
      }`}
    >
      <div className="pt-0.5 shrink-0">
        <RunIcon run={run} size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-relaxed truncate">{run.displayTitle || run.commitMessage || run.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground/60 truncate">{run.name}</span>
          <span className="text-xs text-muted-foreground/40 ml-auto shrink-0">{relativeTime(run.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <GitBranch className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
          <span className="text-xs text-muted-foreground/50 truncate">{run.branch}</span>
          <span className="text-xs text-muted-foreground/30 font-mono ml-auto shrink-0">#{run.runNumber}</span>
        </div>
      </div>
    </button>
  )
}

// ── Run detail (header + jobs + log pane) ─────────────────────────────────────

function RunDetail({ run, repoUrl, token, onRerun }: {
  run: GitHubWorkflowRun
  repoUrl: string
  token: string
  onRerun: () => Promise<void>
}) {
  const [jobs, setJobs] = useState<GitHubWorkflowJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJob, setSelectedJob] = useState<GitHubWorkflowJob | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set())
  const [rerunning, setRerunning] = useState(false)

  const loadJobs = useCallback(async () => {
    const r = await window.electronAPI?.github.getWorkflowRunJobs(token, repoUrl, run.id)
    if (r?.ok) {
      setJobs(r.jobs)
      // only auto-select first job on initial load, never re-expand on polls
      setSelectedJob(prev => prev ? (r.jobs.find(j => j.id === prev.id) ?? prev) : (r.jobs[0] ?? null))
    }
    setLoadingJobs(false)
  }, [token, repoUrl, run.id])

  useEffect(() => {
    setLoadingJobs(true)
    loadJobs()
  }, [loadJobs])

  // Poll jobs while run is in progress
  useEffect(() => {
    if (!isRunning(run.status)) return
    const id = setInterval(loadJobs, 6000)
    return () => clearInterval(id)
  }, [run.status, loadJobs])

  const canRerun = run.status === 'completed' &&
    (run.conclusion === 'failure' || run.conclusion === 'cancelled' || run.conclusion === 'timed_out')

  function toggleJob(id: number) {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Run metadata header */}
      <div className="px-3 py-3 border-b border-border bg-card shrink-0 space-y-2">
        <div className="flex items-start gap-2">
          <RunIcon run={run} size={13} />
          <p className="text-xs font-semibold text-foreground leading-relaxed flex-1 min-w-0">
            {run.displayTitle || run.commitMessage || run.name}
          </p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="h-3 w-3 shrink-0" />
            <span className="truncate">{run.name}</span>
            <span className="text-muted-foreground/40 font-mono ml-1">#{run.runNumber}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <img src={run.actor.avatarUrl} alt={run.actor.login} className="w-3.5 h-3.5 rounded-full" />
            <span className="truncate">{run.actor.login}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            <code className="text-accent bg-accent/10 px-1 rounded text-[10px]">{run.branch}</code>
            <span className="text-muted-foreground/40 font-mono text-[10px]">{run.sha.slice(0, 7)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{relativeTime(run.createdAt)}</span>
            <span className="text-[10px] bg-secondary px-1 rounded text-muted-foreground/60 capitalize">{run.event}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <RunStatusChip run={run} />
          <button
            onClick={() => window.electronAPI?.github.openAuthUrl(run.htmlUrl)}
            className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </button>
          {canRerun && (
            <button
              onClick={async () => { setRerunning(true); await onRerun(); setRerunning(false) }}
              disabled={rerunning}
              className="flex items-center gap-1 px-2 h-6 rounded text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-40"
            >
              {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Re-run
            </button>
          )}
        </div>
      </div>

      {/* Jobs + log pane */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Jobs column */}
        <div className="w-56 shrink-0 flex flex-col border-r border-border min-h-0">
          <div className="flex items-center justify-between px-3 h-7 border-b border-border shrink-0">
            <span className="text-xs font-semibold text-muted-foreground">
              {loadingJobs ? 'Jobs' : `Jobs (${jobs.length})`}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingJobs ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </div>
            ) : jobs.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground/50">No jobs</p>
            ) : (
              jobs.map(job => (
                <div key={job.id}>
                  {/* Job row — click body to select, click arrow to toggle steps */}
                  <div
                    className={`flex items-center border-b border-border/40 transition-colors ${
                      selectedJob?.id === job.id ? 'bg-accent/10' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0 text-left"
                    >
                      <JobIcon job={job} />
                      <span className="text-xs text-foreground flex-1 min-w-0 truncate">{job.name}</span>
                      {job.startedAt && (
                        <span className="text-[10px] text-muted-foreground/40 shrink-0">
                          {duration(job.startedAt, job.completedAt)}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => toggleJob(job.id)}
                      className="flex items-center justify-center w-7 h-full py-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
                    >
                      {expandedJobs.has(job.id)
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />
                      }
                    </button>
                  </div>
                  {/* Steps — same left edge as job row, indented with a left border */}
                  {expandedJobs.has(job.id) && job.steps.map(step => (
                    <div
                      key={step.number}
                      className="flex items-center gap-2 px-3 py-1.5 border-b border-border/20 bg-secondary/10 border-l-2 border-l-border/40 ml-3"
                    >
                      <StepIcon conclusion={step.conclusion} status={step.status} />
                      <span className={`text-xs flex-1 min-w-0 truncate ${step.conclusion === 'skipped' ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                        {step.name}
                      </span>
                      {step.startedAt && (
                        <span className="text-[10px] text-muted-foreground/30 shrink-0">
                          {duration(step.startedAt, step.completedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Log pane */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {selectedJob ? (
            <LogPane
              key={selectedJob.id}
              job={selectedJob}
              repoUrl={repoUrl}
              token={token}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/50">Select a job to view logs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Log pane ──────────────────────────────────────────────────────────────────

const LOG_LINE_H = 18

function LogPane({ job, repoUrl, token }: {
  job: GitHubWorkflowJob
  repoUrl: string
  token: string
}) {
  const [rawLog, setRawLog] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)
  const prevScrollTop = useRef(0)

  const entries = useMemo(() => {
    if (!rawLog) return []
    return parseLogEntries(rawLog)
  }, [rawLog])

  const visibleEntries = useMemo(
    () => entries.filter(e => e.kind === 'group' || !collapsedGroups.has(e.groupIdx)),
    [entries, collapsedGroups]
  )

  const virt = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => visibleEntries[i]?.kind === 'group' ? 24 : LOG_LINE_H,
    overscan: 20,
  })

  const fetchLogs = useCallback(async () => {
    if (job.status === 'queued' || job.status === 'waiting') {
      setLoading(false)
      return
    }
    const r = await window.electronAPI?.github.getJobLogs(token, repoUrl, job.id)
    if (r?.ok) {
      setRawLog(r.logs)
      setError('')
    } else {
      setError(r?.error ?? 'Failed to load logs')
    }
    setLoading(false)
  }, [token, repoUrl, job.id, job.status])

  useEffect(() => {
    setLoading(true)
    setRawLog('')
    setError('')
    setAutoScroll(true)
    fetchLogs()
  }, [fetchLogs])

  // Poll while job is running
  useEffect(() => {
    if (job.status !== 'in_progress') return
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [job.status, fetchLogs])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (!autoScroll || visibleEntries.length === 0) return
    virt.scrollToIndex(visibleEntries.length - 1, { align: 'end' })
  }, [visibleEntries.length, autoScroll])

  // Detect manual scroll-up to pause auto-scroll
  function handleScroll() {
    const el = parentRef.current
    if (!el) return
    const scrollingUp = el.scrollTop < prevScrollTop.current
    prevScrollTop.current = el.scrollTop
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (scrollingUp) setAutoScroll(false)
    if (atBottom) setAutoScroll(true)
  }

  // Colour log line based on content hints
  function lineColor(content: string): string {
    const lc = content.toLowerCase()
    if (lc.includes('error') || lc.includes('failed') || lc.includes('failure')) return 'text-[#e06c75]'
    if (lc.includes('warning') || lc.includes('warn')) return 'text-yellow-400'
    if (lc.startsWith('##[group]') || lc.startsWith('##[endgroup]')) return 'text-accent/70'
    if (lc.startsWith('##[') ) return 'text-muted-foreground/50'
    return 'text-[#abb2bf]'
  }

  function formatTimestamp(ts: string): string {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '' }
  }

  const header = (
    <div className="flex items-center justify-between px-3 h-7 border-b border-border bg-card shrink-0">
      <span className="text-xs font-semibold text-muted-foreground truncate">{job.name}</span>
      <div className="flex items-center gap-2 shrink-0">
        {job.status === 'in_progress' && (
          <span className="flex items-center gap-1 text-[10px] text-yellow-400">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Live
          </span>
        )}
        {!autoScroll && visibleEntries.length > 0 && (
          <button
            onClick={() => { setAutoScroll(true); virt.scrollToIndex(visibleEntries.length - 1, { align: 'end' }) }}
            className="text-[10px] text-accent hover:text-accent/80 transition-colors"
          >
            ↓ Follow
          </button>
        )}
        <button
          onClick={() => window.electronAPI?.github.openAuthUrl(job.htmlUrl)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-accent transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Open
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground" style={{ background: '#1e2227' }}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading logs…
      </div>
    </div>
  )

  if (job.status === 'queued' || job.status === 'waiting') return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 flex items-center justify-center" style={{ background: '#1e2227' }}>
        <p className="text-xs text-muted-foreground/50">Job is waiting to run…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 flex items-center justify-center" style={{ background: '#1e2227' }}>
        <p className="text-xs text-[#e06c75]">{error}</p>
      </div>
    </div>
  )

  if (entries.length === 0) return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 flex items-center justify-center" style={{ background: '#1e2227' }}>
        <p className="text-xs text-muted-foreground/50">No log output</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto min-h-0 font-mono text-xs"
        style={{ background: '#1e2227' }}
      >
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map(row => {
            const entry = visibleEntries[row.index]

            if (entry.kind === 'group') {
              const isCollapsed = collapsedGroups.has(entry.groupIdx)
              return (
                <button
                  key={row.index}
                  onClick={() => {
                    setCollapsedGroups(prev => {
                      const next = new Set(prev)
                      if (next.has(entry.groupIdx)) next.delete(entry.groupIdx)
                      else next.add(entry.groupIdx)
                      return next
                    })
                    virt.scrollToIndex(row.index, { align: 'start' })
                  }}
                  style={{ position: 'absolute', top: row.start, left: 0, height: 24, minWidth: '100%', background: '#252930', borderTop: '1px solid #3e4451', borderBottom: '1px solid #3e4451' }}
                  className="flex items-center gap-2 px-3 w-full text-left hover:bg-white/5 transition-colors select-none"
                >
                  {isCollapsed
                    ? <ChevronRight className="h-3 w-3 text-accent/60 shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-accent/60 shrink-0" />
                  }
                  <span className="text-[11px] font-semibold text-accent/80 flex-1 truncate">{entry.name}</span>
                  {entry.timestamp && (
                    <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  )}
                </button>
              )
            }

            const { timestamp, content, lineNo } = entry
            return (
              <div
                key={row.index}
                style={{ position: 'absolute', top: row.start, left: 0, height: LOG_LINE_H, minWidth: '100%' }}
                className="flex items-center hover:bg-white/5 transition-colors select-text"
              >
                <span className="w-8 text-right pr-2 text-[10px] text-muted-foreground/20 shrink-0 select-none">
                  {lineNo}
                </span>
                {timestamp && (
                  <span className="pr-3 text-[10px] text-muted-foreground/30 shrink-0 tabular-nums select-none">
                    {formatTimestamp(timestamp)}
                  </span>
                )}
                <span className={`whitespace-pre leading-[18px] ${lineColor(content)}`}>
                  {content}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
