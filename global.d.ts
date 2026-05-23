export {}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      zoomIn: () => void
      zoomOut: () => void
      onUpdateAvailable?: (cb: () => void) => void
      onUpdateProgress?: (cb: (percent: number) => void) => void
      onUpdateDownloaded: (cb: () => void) => void
      installUpdate?: () => void

      git: {
        openDialog: () => Promise<string | null>
        cloneDialog: () => Promise<string | null>
        isRepo: (path: string) => Promise<boolean>
        init: (path: string) => Promise<{ ok: boolean; stderr: string }>
        clone: (url: string, dest: string) => Promise<{ ok: boolean; stderr: string }>
        onCloneProgress: (cb: (s: string) => void) => void

        recentRepos: () => Promise<{ path: string; name: string; exists: boolean }[]>
        addRecent: (path: string) => Promise<{ ok: boolean }>
        removeRecent: (path: string) => Promise<{ ok: boolean }>

        status: (path: string) => Promise<{ ok: boolean; files: GitFile[] }>
        stage: (path: string, files: string[]) => Promise<{ ok: boolean; stderr: string }>
        stageAll: (path: string) => Promise<{ ok: boolean; stderr: string }>
        unstage: (path: string, files: string[]) => Promise<{ ok: boolean; stderr: string }>
        discard: (path: string, files: string[]) => Promise<{ ok: boolean; stderr: string }>

        diff: (path: string, file: string, staged: boolean) => Promise<{ ok: boolean; diff: string }>
        diffUntracked: (path: string, file: string) => Promise<{ ok: boolean; content: string }>

        commit: (path: string, message: string, description?: string, authorName?: string, authorEmail?: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>

        push: (path: string, remote: string, branch: string) => Promise<{ ok: boolean; stderr: string }>
        pull: (path: string, remote: string, branch: string) => Promise<{ ok: boolean; stderr: string; stdout: string }>
        fetch: (path: string) => Promise<{ ok: boolean; stderr: string }>

        branches: (path: string) => Promise<{ ok: boolean; branches: GitBranch[]; current: string }>
        checkout: (path: string, branch: string, create?: boolean) => Promise<{ ok: boolean; stderr: string }>
        deleteBranch: (path: string, branch: string) => Promise<{ ok: boolean; stderr: string }>

        remotes:        (path: string) => Promise<{ ok: boolean; remotes: { name: string; url: string }[] }>
        listFiles:      (path: string) => Promise<{ ok: boolean; files: string[] }>
        readGitignore:  (path: string) => Promise<{ ok: boolean; patterns: string[] }>
        writeGitignore: (path: string, patterns: string[]) => Promise<{ ok: boolean }>
        addRemote:      (path: string, name: string, url: string) => Promise<{ ok: boolean; stderr: string }>

        log: (path: string, limit?: number) => Promise<{ ok: boolean; commits: GitCommit[] }>
        show: (path: string, hash: string) => Promise<{ ok: boolean; diff: string; stat: string; body: string }>
        showFiles: (path: string, hash: string) => Promise<{ ok: boolean; files: { status: string; path: string }[] }>
        repoInfo: (path: string) => Promise<{ branch: string; remote: string; aheadBy: number; behindBy: number }>
      }

      github: {
        deviceFlowStart: () => Promise<{ ok: boolean; device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>
        deviceFlowPoll: (deviceCode: string, interval: number) => Promise<{ ok: boolean; token?: string; error?: string }>
        openAuthUrl: (url: string) => Promise<void>
        getUser: (token: string) => Promise<{ ok: boolean; user?: { login: string; name: string; avatar_url: string; email: string } }>
        listRepos:     (token: string) => Promise<{ ok: boolean; repos?: GitHubRepo[]; error?: string }>
        checkRepoName: (token: string, name: string) => Promise<{ available: boolean }>
        repoExists:    (token: string, repoUrl: string) => Promise<{ exists: boolean }>
        createRepo:    (token: string, name: string, description: string, isPrivate: boolean) => Promise<{ ok: boolean; cloneUrl?: string; htmlUrl?: string; fullName?: string; error?: string }>
      }

      store: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<{ ok: boolean }>
        delete: (key: string) => Promise<{ ok: boolean }>
      }

      shell: {
        openPath: (path: string) => Promise<void>
        showItem: (path: string) => Promise<void>
      }
    }
  }

  interface GitFile {
    path: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
    staged: boolean
    unstaged: boolean
  }

  interface GitBranch {
    name: string
    upstream: string
    current: boolean
  }

  interface GitHubRepo {
    name: string
    full_name: string
    clone_url: string
    private: boolean
    description: string | null
    updated_at: string
  }

  interface GitHubAccount {
    login: string
    name: string
    email: string
    avatarUrl: string
    token: string
  }

  interface GitCommit {
    hash: string
    short: string
    author: string
    email: string
    date: string
    message: string
    refs: string
  }
}
