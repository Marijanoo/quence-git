'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { X, Globe, Lock, Check, Loader2, Search, CheckSquare, Square, ChevronRight, Folder, FolderOpen, File } from 'lucide-react'
import { toast } from 'sonner'

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  repoPath: string
  repoName: string
  token: string
  onPublished: () => void
}

type Availability = 'idle' | 'checking' | 'available' | 'taken'

// A row in the flattened virtual list
type TreeRow =
  | { kind: 'folder'; path: string; depth: number; name: string }
  | { kind: 'file';   path: string; depth: number; name: string }

type TreeNode = { dirs: Map<string, TreeNode>; files: string[] }

// Build the node tree once from the file list — O(n)
function buildNodeTree(files: string[]): TreeNode {
  const root: TreeNode = { dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.split('/')
    let cur = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!cur.dirs.has(seg)) cur.dirs.set(seg, { dirs: new Map(), files: [] })
      cur = cur.dirs.get(seg)!
    }
    cur.files.push(parts[parts.length - 1])
  }
  return root
}

// Precompute folder → all descendant file paths — O(n)
function buildFolderFileMap(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const f of files) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/')
      if (!map.has(folder)) map.set(folder, [])
      map.get(folder)!.push(f)
    }
  }
  return map
}

// Flatten visible rows from the node tree, skipping collapsed subtrees — O(visible)
function flattenTree(node: TreeNode, prefix: string, depth: number, collapsed: Set<string>, rows: TreeRow[]) {
  for (const [seg, child] of node.dirs) {
    const folderPath = prefix ? `${prefix}/${seg}` : seg
    rows.push({ kind: 'folder', path: folderPath, depth, name: seg })
    if (!collapsed.has(folderPath)) {
      flattenTree(child, folderPath, depth + 1, collapsed, rows)
    }
  }
  for (const name of node.files) {
    rows.push({ kind: 'file', path: prefix ? `${prefix}/${name}` : name, depth, name })
  }
}

// A file/folder is "covered" if it or any ancestor folder is in selected
function isCovered(path: string, selected: Set<string>): boolean {
  if (selected.has(path)) return true
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    if (selected.has(parts.slice(0, i).join('/'))) return true
  }
  return false
}

function folderCheckState(folderFileMap: Map<string, string[]>, prefix: string, selected: Set<string>): 'none' | 'all' | 'some' {
  // folder itself is selected → all
  if (selected.has(prefix)) return 'all'
  const children = folderFileMap.get(prefix)
  if (!children || children.length === 0) return 'none'
  let covCount = 0
  for (const f of children) { if (isCovered(f, selected)) covCount++ }
  if (covCount === 0) return 'none'
  if (covCount === children.length) return 'all'
  return 'some'
}

export function PublishDialog({ open, onClose, repoPath, repoName, token, onPublished }: PublishDialogProps) {
  const [name, setName] = useState(repoName)
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [availability, setAvailability] = useState<Availability>('idle')
  const [showGitignore, setShowGitignore] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileSearch, setFileSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileListRef = useRef<HTMLDivElement>(null)

  // When searching: flat filtered list. Otherwise: tree rows.
  const filteredFiles = useMemo(
    () => fileSearch ? files.filter(f => f.toLowerCase().includes(fileSearch.toLowerCase())) : [],
    [files, fileSearch]
  )

  // Node tree and folder→files map — rebuilt only when files change
  const nodeTree = useMemo(() => buildNodeTree(files), [files])
  const folderFileMap = useMemo(() => buildFolderFileMap(files), [files])

  // Visible rows — rebuilt only when collapsed changes (cheap: only visits visible nodes)
  const treeRows = useMemo(() => {
    if (fileSearch) return []
    const rows: TreeRow[] = []
    flattenTree(nodeTree, '', 0, collapsed, rows)
    return rows
  }, [nodeTree, fileSearch, collapsed])

  const virtCount = fileSearch ? filteredFiles.length : treeRows.length

  const fileVirt = useVirtualizer({
    count: virtCount,
    getScrollElement: () => fileListRef.current,
    estimateSize: () => 28,
    overscan: 12,
  })

  useEffect(() => {
    if (!open) return
    setName(repoName)
    setDescription('')
    setIsPrivate(false)
    setAvailability('idle')
    setFiles([])
    setFileSearch('')
    setSelected(new Set())
    setCollapsed(new Set())
    // auto-open gitignore panel if one already exists
    window.electronAPI?.git.readGitignore(repoPath).then(r => {
      setShowGitignore(r?.ok && r.patterns.length > 0)
    })
  }, [open, repoName, repoPath])

  useEffect(() => {
    if (!open) return
    if (!name.trim()) { setAvailability('idle'); return }
    setAvailability('checking')
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    checkTimerRef.current = setTimeout(async () => {
      const r = await window.electronAPI?.github.checkRepoName(token, name.trim())
      setAvailability(r?.available ? 'available' : 'taken')
    }, 600)
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current) }
  }, [open, name, token])

  const loadFiles = useCallback(async () => {
    setFilesLoading(true)
    const [filesRes, ignoreRes] = await Promise.all([
      window.electronAPI?.git.listFiles(repoPath),
      window.electronAPI?.git.readGitignore(repoPath),
    ])
    setFilesLoading(false)
    if (!filesRes?.ok) return
    const allFiles = filesRes.files
    setFiles(allFiles)

    // collect all folder paths and start them collapsed
    const folders = new Set<string>()
    for (const f of allFiles) {
      const parts = f.split('/')
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'))
      }
    }
    setCollapsed(folders)

    if (ignoreRes?.ok && ignoreRes.patterns.length > 0) {
      // store the patterns themselves — folder patterns count as 1, not all their children
      const allFolders = new Set<string>()
      for (const f of allFiles) {
        const parts = f.split('/')
        for (let i = 1; i < parts.length; i++) allFolders.add(parts.slice(0, i).join('/'))
      }
      const preSelected = new Set<string>()
      for (const p of ignoreRes.patterns) {
        const clean = p.replace(/\/$/, '')
        // if it matches a known folder, store the folder path; otherwise store as-is if it matches a file
        if (allFolders.has(clean)) {
          preSelected.add(clean)
        } else if (allFiles.includes(clean)) {
          preSelected.add(clean)
        }
      }
      if (preSelected.size > 0) setSelected(preSelected)
    }
  }, [repoPath])

  useEffect(() => {
    if (showGitignore && files.length === 0) loadFiles()
  }, [showGitignore, files.length, loadFiles])

  function toggleFolder(folderPath: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(folderPath) ? next.delete(folderPath) : next.add(folderPath)
      return next
    })
  }

  function toggleFolderSelect(folderPath: string) {
    const state = folderCheckState(folderFileMap, folderPath, selected)
    setSelected(prev => {
      const next = new Set(prev)
      if (state === 'all') {
        // deselect: remove the folder itself and any individual children that were selected
        next.delete(folderPath)
        const children = folderFileMap.get(folderPath) ?? []
        children.forEach(f => next.delete(f))
        // also remove any sub-folder patterns under this path
        for (const key of next) {
          if (key.startsWith(folderPath + '/')) next.delete(key)
        }
      } else {
        // select: add folder path, remove any redundant individual entries underneath
        const children = folderFileMap.get(folderPath) ?? []
        children.forEach(f => next.delete(f))
        for (const key of next) {
          if (key.startsWith(folderPath + '/')) next.delete(key)
        }
        next.add(folderPath)
      }
      return next
    })
  }

  function toggleFile(f: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  function toggleAll() {
    if (fileSearch) {
      const allSel = filteredFiles.every(f => isCovered(f, selected))
      setSelected(prev => {
        const next = new Set(prev)
        filteredFiles.forEach(f => allSel ? next.delete(f) : next.add(f))
        return next
      })
    } else {
      // select all: just store a single root-level wildcard by selecting each top-level entry
      // simplest: clear and re-add all files; deselect: clear everything
      const allSel = files.every(f => isCovered(f, selected))
      setSelected(allSel ? new Set() : new Set(files))
    }
  }

  const allSelected = fileSearch
    ? filteredFiles.length > 0 && filteredFiles.every(f => isCovered(f, selected))
    : files.length > 0 && files.every(f => isCovered(f, selected))

  async function handlePublish() {
    if (!name.trim() || availability !== 'available') return
    setPublishing(true)
    try {
      if (selected.size > 0) {
        const patterns = Array.from(selected).map(p =>
          folderFileMap.has(p) ? p + '/' : p
        )
        await window.electronAPI?.git.writeGitignore(repoPath, patterns)
      }
      const created = await window.electronAPI?.github.createRepo(token, name.trim(), description.trim(), isPrivate)
      if (!created?.ok || !created.cloneUrl) {
        toast.error(created?.error ?? 'Failed to create repository')
        return
      }
      const remoteRes = await window.electronAPI?.git.addRemote(repoPath, 'origin', created.cloneUrl)
      if (!remoteRes?.ok) {
        toast.error(remoteRes?.stderr ?? 'Failed to add remote')
        return
      }
      toast.success(`Repository created: ${created.fullName}`)
      onPublished()
      onClose()
    } finally {
      setPublishing(false)
    }
  }

  if (!open) return null

  const showEmpty = !filesLoading && virtCount === 0
  const emptyMsg = fileSearch ? 'No matches' : 'No files'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`bg-card border border-border rounded-lg shadow-xl flex items-start ${showGitignore ? 'w-[780px]' : 'w-[440px]'} max-h-[80vh] transition-all duration-200`}>

        {/* Left: main form */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <span className="text-sm font-semibold">Publish repository</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Repository name</label>
              <div className="relative">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-8 px-3 pr-8 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {availability === 'checking' && <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}
                  {availability === 'available' && <Check className="h-3.5 w-3.5 text-green-400" />}
                  {availability === 'taken' && <X className="h-3.5 w-3.5 text-destructive" />}
                </div>
              </div>
              {availability === 'taken' && <p className="text-xs text-destructive">Name already taken</p>}
              {availability === 'available' && <p className="text-xs text-green-400">Name is available</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Description <span className="text-muted-foreground/50">(optional)</span></label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short description of the repository"
                className="w-full h-8 px-3 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Visibility</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPrivate(false)}
                  className={`flex-1 flex items-center gap-2 px-3 h-9 rounded-md border text-sm transition-colors ${!isPrivate ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <p className="text-xs font-medium">Public</p>
                  {!isPrivate && <Check className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />}
                </button>
                <button
                  onClick={() => setIsPrivate(true)}
                  className={`flex-1 flex items-center gap-2 px-3 h-9 rounded-md border text-sm transition-colors ${isPrivate ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <p className="text-xs font-medium">Private</p>
                  {isPrivate && <Check className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />}
                </button>
              </div>
            </div>

            {/* Gitignore toggle */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">.gitignore</label>
              <button
                onClick={() => setShowGitignore(o => !o)}
                className={`w-full flex items-center justify-between px-3 h-9 rounded-md border text-sm transition-colors ${showGitignore ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                <span className="text-xs">{selected.size > 0 ? `${selected.size} pattern${selected.size !== 1 ? 's' : ''} selected` : 'Select files to ignore…'}</span>
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showGitignore ? 'rotate-90' : ''}`} />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 pb-4 shrink-0">
            <button onClick={onClose} className="h-8 px-4 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={!name.trim() || availability !== 'available' || publishing}
              className="h-8 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {publishing && <Loader2 className="h-3 w-3 animate-spin" />}
              Publish repository
            </button>
          </div>
        </div>

        {/* Right: file tree picker */}
        {showGitignore && (
          <div className="w-80 border-l border-border flex flex-col shrink-0 overflow-hidden self-stretch">
            <div className="px-3 py-2 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Select files to ignore</p>
                {(fileSearch ? filteredFiles.length : files.length) > 0 && (
                  <button onClick={toggleAll} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 h-7 px-2 rounded-md bg-input border border-border focus-within:border-accent/50 transition-colors">
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  placeholder="Filter files…"
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
              </div>
            </div>

            <div ref={fileListRef} className="flex-1 overflow-y-auto min-h-0">
              {filesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                </div>
              ) : showEmpty ? (
                <p className="text-xs text-muted-foreground text-center py-6">{emptyMsg}</p>
              ) : (
                <div style={{ height: fileVirt.getTotalSize(), position: 'relative' }}>
                  {fileVirt.getVirtualItems().map(row => {
                    if (fileSearch) {
                      // Flat search results
                      const f = filteredFiles[row.index]
                      const name = f.split('/').pop() ?? f
                      return (
                        <div
                          key={f}
                          onClick={() => toggleFile(f)}
                          style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: 28 }}
                          className="flex items-center gap-1.5 px-2 cursor-pointer hover:bg-secondary/50 transition-colors"
                        >
                          {isCovered(f, selected)
                            ? <CheckSquare className="h-3.5 w-3.5 text-accent shrink-0" />
                            : <Square className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          }
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-foreground truncate flex-1">{name}</span>
                          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[90px] shrink-0 text-right">{f.includes('/') ? f.substring(0, f.lastIndexOf('/')) : ''}</span>
                        </div>
                      )
                    }

                    // Tree mode
                    const item = treeRows[row.index]
                    const indent = item.depth * 12

                    if (item.kind === 'folder') {
                      const isOpen = !collapsed.has(item.path)
                      const checkState = folderCheckState(folderFileMap, item.path, selected)
                      return (
                        <div
                          key={item.path}
                          style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: 28 }}
                          className="flex items-center px-2 hover:bg-secondary/50 transition-colors"
                        >
                          <div style={{ width: indent, flexShrink: 0 }} />
                          {/* checkbox — select only */}
                          <button
                            onClick={() => toggleFolderSelect(item.path)}
                            className="shrink-0 flex items-center justify-center w-5 h-full"
                          >
                            {checkState === 'all'
                              ? <CheckSquare className="h-3.5 w-3.5 text-accent" />
                              : checkState === 'some'
                                ? <CheckSquare className="h-3.5 w-3.5 text-accent/50" />
                                : <Square className="h-3.5 w-3.5 text-muted-foreground/40" />
                            }
                          </button>
                          {/* chevron + folder icon + name — expand/collapse */}
                          <button
                            onClick={() => toggleFolder(item.path)}
                            className="flex items-center gap-1.5 flex-1 min-w-0 h-full pl-1 cursor-pointer"
                          >
                            <ChevronRight className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            {isOpen
                              ? <FolderOpen className="h-3.5 w-3.5 text-accent/70 shrink-0" />
                              : <Folder className="h-3.5 w-3.5 text-accent/70 shrink-0" />
                            }
                            <span className="text-xs text-foreground truncate">{item.name}</span>
                          </button>
                        </div>
                      )
                    }

                    // file row
                    const f = item.path
                    return (
                      <div
                        key={f}
                        onClick={() => toggleFile(f)}
                        style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: 28 }}
                        className="flex items-center gap-1.5 px-2 cursor-pointer hover:bg-secondary/50 transition-colors"
                      >
                        <div style={{ width: indent, flexShrink: 0 }} />
                        {selected.has(f)
                          ? <CheckSquare className="h-3.5 w-3.5 text-accent shrink-0" />
                          : <Square className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        }
                        <div className="w-3 shrink-0" />
                        <File className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <span className="text-xs text-foreground truncate">{item.name}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {selected.size > 0 && (
              <div className="px-3 py-2 border-t border-border shrink-0">
                <p className="text-[10px] text-muted-foreground">{selected.size} pattern{selected.size !== 1 ? 's' : ''} will be added to .gitignore</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
