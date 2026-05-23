'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { FilePlus, FileMinus, FileEdit, FileDiff, FileX, CheckSquare, Square, RotateCcw, ArrowUp, ArrowDown, Loader2, Upload, Archive, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DiffViewer } from '@/components/diff-viewer'
import { PublishDialog } from '@/components/publish-dialog'
import { toast } from 'sonner'

interface ChangesViewProps {
  repoPath: string
  repoName: string
  refreshKey: number
  onRefresh: () => void
  branch: string
  aheadBy: number
  behindBy: number
  githubAccount?: GitHubAccount | null
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  modified:  <FileEdit className="h-3.5 w-3.5 text-yellow-400" />,
  added:     <FilePlus className="h-3.5 w-3.5 text-green-400" />,
  deleted:   <FileMinus className="h-3.5 w-3.5 text-red-400" />,
  renamed:   <FileDiff className="h-3.5 w-3.5 text-blue-400" />,
  untracked: <FileX className="h-3.5 w-3.5 text-muted-foreground" />,
}

const STATUS_LABEL: Record<string, string> = {
  modified:  'M',
  added:     'A',
  deleted:   'D',
  renamed:   'R',
  untracked: 'U',
}

const STATUS_LABEL_CLASS: Record<string, string> = {
  modified:  'text-yellow-400',
  added:     'text-green-400',
  deleted:   'text-red-400',
  renamed:   'text-blue-400',
  untracked: 'text-muted-foreground/60',
}

const ROW_H = 32
const ROW_H_DIR = 44

function rowHeight(file: GitFile) {
  return file.path.includes('/') ? ROW_H_DIR : ROW_H
}

export function ChangesView({ repoPath, repoName, refreshKey, onRefresh, branch, aheadBy, behindBy, githubAccount }: ChangesViewProps) {
  const [files, setFiles] = useState<GitFile[]>([])
  const [selectedFile, setSelectedFile] = useState<GitFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [commitDesc, setCommitDesc] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [hasRemote, setHasRemote] = useState<boolean | null>(null)
  const [hasAccess, setHasAccess] = useState(true)
  const [publishOpen, setPublishOpen] = useState(false)
  const [stashes, setStashes] = useState<GitStash[]>([])
  const [stashesOpen, setStashesOpen] = useState(false)

  const stagedParentRef = useRef<HTMLDivElement>(null)
  const unstagedParentRef = useRef<HTMLDivElement>(null)

  const loadStatus = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const r = await window.electronAPI?.git.status(repoPath)
    if (r?.ok) {
      setFiles(r.files)
      setSelectedFile(prev => prev ? (r.files.find(f => f.path === prev.path) ?? null) : null)
    }
    setLoading(false)
  }, [repoPath])

  const loadStashes = useCallback(async () => {
    const r = await window.electronAPI?.git.stashList(repoPath)
    if (r?.ok) setStashes(r.stashes)
  }, [repoPath])

  useEffect(() => { loadStatus(true); loadStashes() }, [loadStatus, loadStashes, refreshKey])

  useEffect(() => {
    async function checkRemote() {
      const r = await window.electronAPI?.git.remotes(repoPath)
      if (!r?.ok || r.remotes.length === 0) { setHasRemote(false); setHasAccess(true); return }
      const url = r.remotes[0]?.url
      setHasRemote(true)
      if (url && githubAccount?.token && url.includes('github.com')) {
        const exists = await window.electronAPI?.github.repoExists(githubAccount.token, url)
        setHasAccess(exists?.exists ?? true)
      } else {
        setHasAccess(true)
      }
    }
    checkRemote()
  }, [repoPath, refreshKey, githubAccount?.token])

  const staged = files.filter(f => f.staged)
  const unstaged = files.filter(f => !f.staged || f.unstaged)

  const stagedVirt = useVirtualizer({
    count: staged.length,
    getScrollElement: () => stagedParentRef.current,
    estimateSize: i => rowHeight(staged[i]),
    overscan: 10,
  })

  const unstagedVirt = useVirtualizer({
    count: unstaged.length,
    getScrollElement: () => unstagedParentRef.current,
    estimateSize: i => rowHeight(unstaged[i]),
    overscan: 10,
  })

  async function stageFile(f: GitFile) {
    setFiles(prev => prev.map(x => x.path === f.path ? { ...x, staged: true, unstaged: false } : x))
    await window.electronAPI?.git.stage(repoPath, [f.path])
    loadStatus()
  }

  async function unstageFile(f: GitFile) {
    setFiles(prev => prev.map(x => x.path === f.path ? { ...x, staged: false, unstaged: true } : x))
    await window.electronAPI?.git.unstage(repoPath, [f.path])
    loadStatus()
  }

  async function stageAll() {
    setFiles(prev => prev.map(x => ({ ...x, staged: true, unstaged: false })))
    await window.electronAPI?.git.stageAll(repoPath)
    loadStatus()
  }

  async function unstageAll() {
    setFiles(prev => prev.map(x => ({ ...x, staged: false, unstaged: true })))
    await window.electronAPI?.git.unstage(repoPath, staged.map(f => f.path))
    loadStatus()
  }

  async function discardFile(f: GitFile) {
    const r = await window.electronAPI?.git.discard(repoPath, [f.path])
    if (r?.ok) { toast.success(`Discarded ${f.path}`); loadStatus(); onRefresh() }
    else toast.error('Discard failed')
  }

  async function handleStashPop(ref: string) {
    const r = await window.electronAPI?.git.stashPop(repoPath, ref)
    if (r?.ok) { toast.success('Stash applied'); loadStatus(); loadStashes(); onRefresh() }
    else toast.error(r?.stderr ?? 'Failed to apply stash')
  }

  async function handleStashDrop(ref: string) {
    const r = await window.electronAPI?.git.stashDrop(repoPath, ref)
    if (r?.ok) { toast.success('Stash dropped'); loadStashes() }
    else toast.error(r?.stderr ?? 'Failed to drop stash')
  }

  async function handleCommit() {
    if (!commitMsg.trim() || staged.length === 0) return
    setCommitting(true)
    const r = await window.electronAPI?.git.commit(repoPath, commitMsg.trim(), commitDesc.trim() || undefined, githubAccount?.name, githubAccount?.email || undefined)
    setCommitting(false)
    if (r?.ok) {
      toast.success('Committed')
      setCommitMsg('')
      setCommitDesc('')
      loadStatus()
      onRefresh()
    } else {
      toast.error(r?.stderr ?? 'Commit failed')
    }
  }

  async function handlePush() {
    setPushing(true)
    const remotes = await window.electronAPI?.git.remotes(repoPath)
    const remote = remotes?.remotes[0]?.name ?? 'origin'
    const r = await window.electronAPI?.git.push(repoPath, remote, branch)
    setPushing(false)
    if (r?.ok) { toast.success('Pushed'); onRefresh() }
    else toast.error(r?.stderr ?? 'Push failed')
  }

  async function handlePull() {
    setPulling(true)
    const remotes = await window.electronAPI?.git.remotes(repoPath)
    const remote = remotes?.remotes[0]?.name ?? 'origin'
    const r = await window.electronAPI?.git.pull(repoPath, remote, branch)
    setPulling(false)
    if (r?.ok) { toast.success('Pulled'); loadStatus(); onRefresh() }
    else toast.error(r?.stderr ?? 'Pull failed')
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Left: file list + commit composer */}
      <div className="w-72 flex flex-col border-r border-border shrink-0">
        {/* Staged + Unstaged each take half the remaining space */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Staged files */}
          <div className="flex flex-col flex-1 min-h-0 border-b border-border">
            <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">Staged ({staged.length})</span>
              {staged.length > 0 && (
                <button onClick={unstageAll} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  Unstage all
                </button>
              )}
            </div>
            <div ref={stagedParentRef} className="flex-1 overflow-y-auto min-h-0">
              {staged.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground/50">No staged changes</p>
              ) : (
                <div style={{ height: stagedVirt.getTotalSize(), position: 'relative' }}>
                  {stagedVirt.getVirtualItems().map(row => {
                    const f = staged[row.index]
                    return (
                      <div key={f.path} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: rowHeight(f) }}>
                        <FileRow
                          file={f}
                          selected={selectedFile?.path === f.path && selectedFile?.staged}
                          onSelect={() => setSelectedFile({ ...f, staged: true })}
                          onToggle={() => unstageFile(f)}
                          toggleIcon={<CheckSquare className="h-3.5 w-3.5 text-accent" />}
                          showDiscard={false}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Unstaged files */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">
                {loading ? 'Changes' : `Changes (${unstaged.length})`}
              </span>
              {unstaged.length > 0 && (
                <button onClick={stageAll} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  Stage all
                </button>
              )}
            </div>
            <div ref={unstagedParentRef} className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </div>
              ) : unstaged.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground/50">No changes</p>
              ) : (
                <div style={{ height: unstagedVirt.getTotalSize(), position: 'relative' }}>
                  {unstagedVirt.getVirtualItems().map(row => {
                    const f = unstaged[row.index]
                    return (
                      <div key={f.path} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: rowHeight(f) }}>
                        <FileRow
                          file={f}
                          selected={selectedFile?.path === f.path && !selectedFile?.staged}
                          onSelect={() => setSelectedFile({ ...f, staged: false })}
                          onToggle={() => stageFile(f)}
                          toggleIcon={<Square className="h-3.5 w-3.5 text-muted-foreground" />}
                          showDiscard
                          onDiscard={() => discardFile(f)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stashes */}
        {stashes.length > 0 && (
          <div className="border-t border-border shrink-0">
            <button
              onClick={() => setStashesOpen(o => !o)}
              className="flex items-center justify-between w-full px-3 h-8 hover:bg-secondary/40 transition-colors"
            >
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Archive className="h-3 w-3" />
                Stashes ({stashes.length})
              </span>
              {stashesOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground/50" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
            </button>
            {stashesOpen && stashes.map(s => (
              <div key={s.ref} className="flex items-center gap-2 px-3 py-2 border-t border-border/40 group hover:bg-secondary/30 transition-colors">
                <Archive className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{s.message.replace(/^On \S+: /, '')}</p>
                  <p className="text-[10px] text-muted-foreground/40">{s.ref}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleStashPop(s.ref)}
                    title="Apply stash"
                    className="px-1.5 h-5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => handleStashDrop(s.ref)}
                    title="Drop stash"
                    className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Commit composer */}
        <div className="border-t border-border shrink-0 p-3 space-y-2">
          <input
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit() }}
            placeholder="Commit message (Ctrl+Enter to commit)"
            className="w-full h-8 px-2 rounded-md bg-input border border-border text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
          />
          <textarea
            value={commitDesc}
            onChange={e => setCommitDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors resize-none"
          />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || staged.length === 0 || committing}
            className="w-full h-8 rounded-md bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {committing && <Loader2 className="h-3 w-3 animate-spin" />}
            Commit to {branch || 'branch'}
          </button>
          {hasRemote === false ? (
            <button
              onClick={() => setPublishOpen(true)}
              disabled={!githubAccount}
              className="w-full h-7 rounded-md bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!githubAccount ? 'Connect a GitHub account to publish' : undefined}
            >
              <Upload className="h-3 w-3" />
              Publish repository
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handlePull}
                disabled={pulling || !hasAccess}
                title={!hasAccess ? 'Current account doesn\'t have access to this repository' : undefined}
                className="flex-1 h-7 rounded-md bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3" />}
                Pull{behindBy > 0 ? ` (${behindBy})` : ''}
              </button>
              <button
                onClick={handlePush}
                disabled={pushing || !hasAccess}
                title={!hasAccess ? 'Current account doesn\'t have access to this repository' : undefined}
                className="flex-1 h-7 rounded-md bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
                Push{aheadBy > 0 ? ` (${aheadBy})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>

      {githubAccount && (
        <PublishDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          repoPath={repoPath}
          repoName={repoName}
          token={githubAccount.token}
          onPublished={() => {
            setHasRemote(true)
            onRefresh()
          }}
        />
      )}

      {/* Right: diff viewer */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {selectedFile ? (
          <DiffViewer repoPath={repoPath} file={selectedFile} key={selectedFile.path + String(selectedFile.staged) + refreshKey} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground/50">Select a file to view diff</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FileRow({
  file,
  selected,
  onSelect,
  onToggle,
  toggleIcon,
  showDiscard,
  onDiscard,
}: {
  file: GitFile
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  toggleIcon: React.ReactNode
  showDiscard: boolean
  onDiscard?: () => void
}) {
  const filename = file.path.split('/').pop() ?? file.path
  const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 h-full cursor-pointer group transition-colors ${
        selected ? 'bg-accent/10' : 'hover:bg-secondary/40'
      }`}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        className="shrink-0"
      >
        {toggleIcon}
      </button>
      {STATUS_ICON[file.status]}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-foreground truncate block">{filename}</span>
        {dir && <span className="text-xs text-muted-foreground/50 truncate block">{dir}</span>}
      </div>
      <span className={`text-xs font-mono shrink-0 ${STATUS_LABEL_CLASS[file.status] ?? 'text-muted-foreground/60'}`}>{STATUS_LABEL[file.status]}</span>
      {showDiscard && onDiscard && (
        <button
          onClick={e => { e.stopPropagation(); onDiscard() }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
          title="Discard changes"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
