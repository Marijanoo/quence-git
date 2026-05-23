'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, GitCommitHorizontal, User, Clock, FilePlus, FileMinus, FileEdit } from 'lucide-react'
import { parseDiff, DiffRenderer } from '@/components/diff-renderer'

interface HistoryViewProps {
  repoPath: string
  refreshKey: number
}

interface CommitFile {
  status: string
  path: string
}

interface CommitDetail {
  diff: string
  stat: string
  body: string
  files: CommitFile[]
}

const FILE_ICON: Record<string, React.ReactNode> = {
  modified: <FileEdit className="h-3.5 w-3.5 text-yellow-400 shrink-0" />,
  added:    <FilePlus className="h-3.5 w-3.5 text-green-400 shrink-0" />,
  deleted:  <FileMinus className="h-3.5 w-3.5 text-red-400 shrink-0" />,
}

const STATUS_LABEL: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D' }

export function HistoryView({ repoPath, refreshKey }: HistoryViewProps) {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GitCommit | null>(null)
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<CommitFile | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [fileDiffLoading, setFileDiffLoading] = useState(false)
  const [limit, setLimit] = useState(100)

  const loadLog = useCallback(async () => {
    setLoading(true)
    const r = await window.electronAPI?.git.log(repoPath, limit)
    if (r?.ok) setCommits(r.commits)
    setLoading(false)
  }, [repoPath, limit])

  useEffect(() => { loadLog() }, [loadLog, refreshKey])

  const loadDetail = useCallback(async (commit: GitCommit) => {
    setDetail(null)
    setSelectedFile(null)
    setFileDiff(null)
    setDetailLoading(true)
    const [showRes, filesRes] = await Promise.all([
      window.electronAPI?.git.show(repoPath, commit.hash),
      window.electronAPI?.git.showFiles(repoPath, commit.hash),
    ])
    if (showRes?.ok && filesRes?.ok) {
      setDetail({ diff: showRes.diff, stat: showRes.stat, body: showRes.body, files: filesRes.files })
    }
    setDetailLoading(false)
  }, [repoPath])

  function handleSelectCommit(c: GitCommit) {
    setSelected(c)
    loadDetail(c)
  }

  async function handleSelectFile(f: CommitFile) {
    if (!selected) return
    setSelectedFile(f)
    setFileDiff(null)
    setFileDiffLoading(true)

    // Extract this file's diff from the full commit diff
    const full = detail?.diff ?? ''
    const fileDiffChunk = extractFileDiff(full, f.path)
    setFileDiff(fileDiffChunk)
    setFileDiffLoading(false)
  }

  function extractFileDiff(fullDiff: string, filePath: string): string {
    const lines = fullDiff.split('\n')
    let capturing = false
    const result: string[] = []

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        capturing = line.includes(` b/${filePath}`) || line.endsWith(` b/${filePath.replace(/\\/g, '/')}`)
        if (capturing) result.push(line)
      } else if (capturing) {
        if (line.startsWith('diff --git')) break
        result.push(line)
      }
    }
    return result.join('\n')
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  function parseRefs(refs: string): { name: string; type: 'branch' | 'tag' | 'remote' | 'head' }[] {
    if (!refs.trim()) return []
    return refs.split(',').map(r => r.trim()).filter(Boolean).map(r => {
      if (r === 'HEAD') return { name: r, type: 'head' as const }
      if (r.startsWith('tag:')) return { name: r.slice(4).trim(), type: 'tag' as const }
      if (r.startsWith('origin/') || r.includes('/')) return { name: r, type: 'remote' as const }
      return { name: r, type: 'branch' as const }
    })
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Commit list */}
      <div className="w-72 flex flex-col border-r border-border shrink-0">
        <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {loading ? 'History' : `History (${commits.length})`}
          </span>
          <button
            onClick={loadLog}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading history…
            </div>
          ) : commits.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground/50">No commits yet</p>
          ) : (
            <>
              {commits.map((c, i) => {
                const refs = parseRefs(c.refs)
                return (
                  <button
                    key={c.hash}
                    onClick={() => handleSelectCommit(c)}
                    className={`w-full flex gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-border/40 ${
                      selected?.hash === c.hash ? 'bg-accent/10' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${selected?.hash === c.hash ? 'bg-accent' : 'bg-accent/50'}`} />
                      {i < commits.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate leading-relaxed">{c.message}</p>
                      {refs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {refs.map(r => (
                            <span
                              key={r.name}
                              className={`text-xs px-1.5 rounded font-mono ${
                                r.type === 'head' ? 'bg-accent/20 text-accent' :
                                r.type === 'branch' ? 'bg-primary/10 text-primary' :
                                r.type === 'remote' ? 'bg-secondary text-muted-foreground' :
                                'bg-yellow-400/10 text-yellow-400'
                              }`}
                            >
                              {r.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground/60 font-mono">{c.short}</span>
                        <span className="text-xs text-muted-foreground/60 truncate">{c.author}</span>
                        <span className="text-xs text-muted-foreground/40 shrink-0 ml-auto">{formatDate(c.date)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
              {commits.length >= limit && (
                <button
                  onClick={() => setLimit(l => l + 100)}
                  className="w-full py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Load more…
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Commit detail */}
      {selected ? (
        <div className="flex flex-1 min-w-0 min-h-0">
          {/* Detail left: metadata + file list */}
          <div className="w-64 flex flex-col border-r border-border shrink-0">
            {/* Commit metadata */}
            <div className="px-3 py-3 border-b border-border space-y-2 shrink-0">
              <p className="text-xs font-semibold text-foreground leading-relaxed">{selected.message}</p>
              {detail?.body && detail.body !== selected.message && (
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{detail.body.replace(selected.message, '').trim()}</p>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{selected.author}</span>
                </div>
                {selected.email && (
                  <p className="text-xs text-muted-foreground/50 pl-4 truncate">{selected.email}</p>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{new Date(selected.date).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitCommitHorizontal className="h-3 w-3 shrink-0" />
                  <span className="font-mono">{selected.hash}</span>
                </div>
              </div>
              {parseRefs(selected.refs).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parseRefs(selected.refs).map(r => (
                    <span
                      key={r.name}
                      className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                        r.type === 'head' ? 'bg-accent/20 text-accent' :
                        r.type === 'branch' ? 'bg-primary/10 text-primary' :
                        r.type === 'remote' ? 'bg-secondary text-muted-foreground' :
                        'bg-yellow-400/10 text-yellow-400'
                      }`}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Changed files */}
            <div className="flex items-center justify-between px-3 h-7 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">
                {detailLoading ? 'Files' : `Files (${detail?.files.length ?? 0})`}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </div>
              ) : detail?.files.map(f => {
                const filename = f.path.split('/').pop() ?? f.path
                const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : ''
                return (
                  <button
                    key={f.path}
                    onClick={() => handleSelectFile(f)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      selectedFile?.path === f.path ? 'bg-accent/10' : 'hover:bg-secondary/40'
                    }`}
                  >
                    {FILE_ICON[f.status] ?? <FileEdit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-foreground truncate block">{filename}</span>
                      {dir && <span className="text-xs text-muted-foreground/40 truncate block">{dir}</span>}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground/50 shrink-0">
                      {STATUS_LABEL[f.status] ?? 'M'}
                    </span>
                  </button>
                )
              })}
              {!detailLoading && detail && detail.files.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground/50">No file changes</p>
              )}
            </div>

            {/* Stat summary */}
            {detail?.stat && (
              <div className="border-t border-border px-3 py-2 shrink-0">
                <pre className="text-xs text-muted-foreground/60 font-mono whitespace-pre-wrap leading-relaxed">
                  {detail.stat.trim()}
                </pre>
              </div>
            )}
          </div>

          {/* Detail right: diff for selected file */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {selectedFile ? (
              fileDiffLoading ? (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading diff…
                </div>
              ) : (
                <CommitFileDiff diff={fileDiff ?? ''} filePath={selectedFile.path} />
              )
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground/50">Select a file to view its diff</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground/50">Select a commit to view details</p>
        </div>
      )}
    </div>
  )
}

// ── Inline diff renderer for commit files ────────────────────────────────────

interface CommitFileDiffProps {
  diff: string
  filePath: string
}

function CommitFileDiff({ diff, filePath }: CommitFileDiffProps) {
  const filename = filePath.split('/').pop() ?? filePath
  const lines = parseDiff(diff)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border bg-card shrink-0">
        <span className="text-xs font-medium text-foreground">{filename}</span>
        <span className="text-xs text-muted-foreground/60 truncate">{filePath}</span>
      </div>
      <div className="flex-1 overflow-auto min-h-0" style={{ background: '#282c34' }}>
        {diff.trim() ? (
          <DiffRenderer lines={lines} filePath={filePath} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-muted-foreground/50">No diff available for this file</p>
          </div>
        )}
      </div>
    </div>
  )
}
