'use client'

import { useEffect, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getHighlighter, langFromPath, highlightLine, type HighlightedToken } from '@/lib/highlighter'
import type { Highlighter } from 'shiki'

export interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk' | 'header'
  content: string
  oldLine?: number
  newLine?: number
}

export function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]) }
      lines.push({ type: 'hunk', content: line })
    } else if (
      line.startsWith('+++') || line.startsWith('---') ||
      line.startsWith('diff ') || line.startsWith('index ') ||
      line.startsWith('new file') || line.startsWith('deleted file') ||
      line.startsWith('similarity') || line.startsWith('rename')
    ) {
      lines.push({ type: 'header', content: line })
    } else if (line.startsWith('+')) {
      lines.push({ type: 'added', content: line.slice(1), newLine: newLine++ })
    } else if (line.startsWith('-')) {
      lines.push({ type: 'removed', content: line.slice(1), oldLine: oldLine++ })
    } else if (line.startsWith(' ') || line === '') {
      lines.push({ type: 'context', content: line.slice(1), oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return lines
}

async function highlightDiff(
  lines: DiffLine[],
  lang: string,
  highlighter: Highlighter
): Promise<Map<number, HighlightedToken[]>> {
  const result = new Map<number, HighlightedToken[]>()
  await Promise.all(
    lines.map(async (line, i) => {
      if (line.type === 'hunk' || line.type === 'header') return
      result.set(i, await highlightLine(line.content, lang, highlighter))
    })
  )
  return result
}

const LINE_H = 20 // matches leading-5

interface DiffRendererProps {
  lines: DiffLine[]
  filePath: string
}

export function DiffRenderer({ lines, filePath }: DiffRendererProps) {
  const lang = langFromPath(filePath)
  const [tokenMap, setTokenMap] = useState<Map<number, HighlightedToken[]>>(new Map())
  const cacheKey = useRef('')
  const parentRef = useRef<HTMLDivElement>(null)

  const virt = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_H,
    overscan: 30,
  })

  useEffect(() => {
    const key = filePath + lines.length
    if (cacheKey.current === key) return
    cacheKey.current = key
    getHighlighter().then(hl => highlightDiff(lines, lang, hl)).then(setTokenMap)
  }, [lines, filePath, lang])

  return (
    <div ref={parentRef} className="h-full overflow-auto min-w-0 font-mono text-xs" style={{ background: '#282c34' }}>
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map(row => {
          const line = lines[row.index]

          if (line.type === 'header') return (
            <div key={row.index} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: LINE_H }}
              className="text-muted-foreground/40 px-2 border-b border-border/30 whitespace-pre select-none leading-5">
              {line.content}
            </div>
          )

          if (line.type === 'hunk') return (
            <div key={row.index} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: LINE_H }}
              className="flex items-center px-2 bg-accent/5 text-accent/60 border-y border-border/20 select-none leading-5">
              <span className="whitespace-pre">{line.content}</span>
            </div>
          )

          const bg = line.type === 'added'
            ? 'var(--diff-added-bg)'
            : line.type === 'removed'
            ? 'var(--diff-removed-bg)'
            : 'transparent'

          const prefixColor = line.type === 'added' ? '#4ec94e' : line.type === 'removed' ? '#e06c75' : 'transparent'
          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
          const tokens = tokenMap.get(row.index)

          return (
            <div key={row.index} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: LINE_H, background: bg }}
              className="flex hover:brightness-110 transition-[filter]">
              <span className="w-10 text-right pr-2 text-muted-foreground/25 shrink-0 select-none leading-5">
                {line.type !== 'added' ? line.oldLine : ''}
              </span>
              <span className="w-10 text-right pr-2 text-muted-foreground/25 shrink-0 select-none leading-5">
                {line.type !== 'removed' ? line.newLine : ''}
              </span>
              <span className="w-4 shrink-0 select-none leading-5" style={{ color: prefixColor }}>{prefix}</span>
              <span className="flex-1 whitespace-pre px-1 selectable leading-5 overflow-hidden">
                {tokens && tokens.length > 0
                  ? tokens.map((t, ti) => <span key={ti} style={{ color: t.color }}>{t.content}</span>)
                  : line.content
                }
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface UntrackedRendererProps {
  content: string
  filePath: string
}

export function UntrackedRenderer({ content, filePath }: UntrackedRendererProps) {
  const lang = langFromPath(filePath)
  const [tokenLines, setTokenLines] = useState<HighlightedToken[][]>([])
  const parentRef = useRef<HTMLDivElement>(null)

  const srcLines = content.split('\n')

  const virt = useVirtualizer({
    count: srcLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_H,
    overscan: 30,
  })

  useEffect(() => {
    getHighlighter().then(async hl => {
      const result = await Promise.all(srcLines.map(l => highlightLine(l, lang, hl)))
      setTokenLines(result)
    })
  }, [content, filePath, lang])

  return (
    <div ref={parentRef} className="h-full overflow-auto min-w-0 font-mono text-xs" style={{ background: '#282c34' }}>
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map(row => {
          const line = srcLines[row.index]
          return (
            <div key={row.index} style={{ position: 'absolute', top: row.start, left: 0, right: 0, height: LINE_H, background: 'var(--diff-added-bg)' }}
              className="flex">
              <span className="w-10 text-right pr-2 text-muted-foreground/25 shrink-0 select-none leading-5">{row.index + 1}</span>
              <span className="w-10 text-right pr-2 text-muted-foreground/25 shrink-0 select-none leading-5">{row.index + 1}</span>
              <span className="w-4 shrink-0 select-none leading-5" style={{ color: '#4ec94e' }}>+</span>
              <span className="flex-1 whitespace-pre px-1 selectable leading-5">
                {tokenLines[row.index]
                  ? tokenLines[row.index].map((t, ti) => <span key={ti} style={{ color: t.color }}>{t.content}</span>)
                  : line
                }
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
