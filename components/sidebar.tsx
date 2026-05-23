'use client'

import { GitCommitHorizontal, History } from 'lucide-react'
import type { ActiveView } from '@/app/page'

interface SidebarProps {
  repoPath: string
  activeView: ActiveView
  onViewChange: (v: ActiveView) => void
  onOpenRepo: (path: string) => void
  refreshKey: number
  onRefresh: () => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
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
