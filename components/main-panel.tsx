'use client'

import type { ActiveView } from '@/app/page'
import { ChangesView } from '@/components/changes-view'
import { HistoryView } from '@/components/history-view'

interface MainPanelProps {
  repoPath: string
  repoName: string
  activeView: ActiveView
  refreshKey: number
  onRefresh: () => void
  branch: string
  githubAccount?: GitHubAccount | null
}

export function MainPanel({ repoPath, repoName, activeView, refreshKey, onRefresh, branch, githubAccount }: MainPanelProps) {
  return (
    <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
      {activeView === 'changes' ? (
        <ChangesView
          repoPath={repoPath}
          repoName={repoName}
          refreshKey={refreshKey}
          onRefresh={onRefresh}
          branch={branch}
          githubAccount={githubAccount}
        />
      ) : (
        <HistoryView repoPath={repoPath} refreshKey={refreshKey} />
      )}
    </div>
  )
}
