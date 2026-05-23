'use client'

import { useEffect, useState } from 'react'
import { Loader2, ImageIcon } from 'lucide-react'
import { parseDiff, DiffRenderer, UntrackedRenderer } from '@/components/diff-renderer'
import type { DiffLine } from '@/components/diff-renderer'

interface DiffViewerProps {
  repoPath: string
  file: GitFile
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'])

function getExt(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

export function DiffViewer({ repoPath, file }: DiffViewerProps) {
  const [lines, setLines] = useState<DiffLine[] | null>(null)
  const [untrackedContent, setUntrackedContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ext = getExt(file.path)
  const isImage = IMAGE_EXTENSIONS.has(ext)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLines(null)
      setUntrackedContent(null)

      if (isImage) { setLoading(false); return }

      if (file.status === 'untracked') {
        const r = await window.electronAPI?.git.diffUntracked(repoPath, file.path)
        if (r?.ok) setUntrackedContent(r.content)
        setLoading(false)
        return
      }

      const r = await window.electronAPI?.git.diff(repoPath, file.path, file.staged)
      if (r?.ok) setLines(parseDiff(r.diff))
      setLoading(false)
    }
    load()
  }, [repoPath, file.path, file.staged, file.status, isImage])

  const filename = file.path.split('/').pop() ?? file.path

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border bg-card shrink-0">
        <span className="text-xs font-medium text-foreground">{filename}</span>
        <span className="text-xs text-muted-foreground/60 truncate">{file.path}</span>
        {file.staged && (
          <span className="ml-auto text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded shrink-0">staged</span>
        )}
      </div>

      <div className="flex-1 min-h-0" style={{ background: '#282c34' }}>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading diff…
          </div>
        ) : isImage ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">Image diff not supported</p>
          </div>
        ) : untrackedContent !== null ? (
          <UntrackedRenderer content={untrackedContent} filePath={file.path} />
        ) : lines && lines.length > 0 ? (
          <DiffRenderer lines={lines} filePath={file.path} />
        ) : (
          <div className="p-4 text-muted-foreground/50 text-xs">No diff available</div>
        )}
      </div>
    </div>
  )
}
