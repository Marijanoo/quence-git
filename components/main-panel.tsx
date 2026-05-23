'use client'

import type { ActiveView } from '@/app/page'
import { ChangesView } from '@/components/changes-view'
import { HistoryView } from '@/components/history-view'
import { PullRequestsView } from '@/components/pull-requests-view'
import { ActionsView } from '@/components/actions-view'

interface MainPanelProps {
  repoPath: string
  repoName: string
  repoUrl: string
  activeView: ActiveView
  refreshKey: number
  onRefresh: () => void
  branch: string
  aheadBy: number
  behindBy: number
  githubAccount?: GitHubAccount | null
  branches: GitBranch[]
}

export function MainPanel({ repoPath, repoName, repoUrl, activeView, refreshKey, onRefresh, branch, aheadBy, behindBy, githubAccount, branches }: MainPanelProps) {
  return (
    <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
      {activeView === 'changes' ? (
        <ChangesView
          repoPath={repoPath}
          repoName={repoName}
          refreshKey={refreshKey}
          onRefresh={onRefresh}
          branch={branch}
          aheadBy={aheadBy}
          behindBy={behindBy}
          githubAccount={githubAccount}
        />
      ) : activeView === 'pull-requests' ? (
        <PullRequestsView
          repoPath={repoPath}
          repoUrl={repoUrl}
          branch={branch}
          githubAccount={githubAccount}
          branches={branches}
        />
      ) : activeView === 'actions' ? (
        <ActionsView
          repoUrl={repoUrl}
          branch={branch}
          githubAccount={githubAccount}
        />
      ) : (
        <HistoryView repoPath={repoPath} refreshKey={refreshKey} />
      )}
    </div>
  )
}
