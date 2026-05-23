'use client'

import { useState } from 'react'
import { Github, Loader2, Copy, Check as CheckIcon, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface WelcomeScreenProps {
  onSkip: () => void
  onAuth: (user: GitHubAccount) => void
}

export function WelcomeScreen({ onSkip, onAuth }: WelcomeScreenProps) {
  const [step, setStep] = useState<'idle' | 'polling'>('idle')
  const [userCode, setUserCode] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleLogin() {
    const r = await window.electronAPI?.github.deviceFlowStart()
    if (!r?.ok || !r.verification_uri) {
      toast.error(`GitHub auth failed${(r as any)?.error ? `: ${(r as any).error}` : ''}`)
      return
    }
    setUserCode(r.user_code)
    setVerificationUri(r.verification_uri)
    setStep('polling')
    window.electronAPI?.github.openAuthUrl(r.verification_uri)
    poll(r.device_code, r.interval)
  }

  async function poll(deviceCode: string, interval: number) {
    for (let i = 0; i < 60; i++) {
      const r = await window.electronAPI?.github.deviceFlowPoll(deviceCode, interval)
      if (r?.ok && r.token) {
        const userRes = await window.electronAPI?.github.getUser(r.token)
        if (userRes?.ok && userRes.user) {
          onAuth({ login: userRes.user.login, name: userRes.user.name ?? userRes.user.login, email: userRes.user.email ?? '', avatarUrl: userRes.user.avatar_url, token: r.token })
          return
        }
      }
      if (r?.error && r.error !== 'authorization_pending') {
        toast.error('GitHub auth expired or denied')
        setStep('idle')
        return
      }
    }
    toast.error('GitHub auth timed out')
    setStep('idle')
  }

  function handleCopy() {
    navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-8">
      {/* Logo + title */}
      <div className="flex flex-col items-center gap-3">
        <Image src="/logo.png" alt="QuenceGIT" width={48} height={48} className="rounded-xl" />
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Welcome to QuenceGIT</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect your GitHub account to get started</p>
        </div>
      </div>

      {/* Auth card */}
      <div className="w-80 bg-card border border-border rounded-xl overflow-hidden shadow-lg">
        {step === 'idle' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
              <Github className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Sign in with GitHub</p>
              <p className="text-xs text-muted-foreground mt-1">Clone repos, browse your repositories, and commit with your GitHub identity</p>
            </div>
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Github className="h-4 w-4" />
              Connect GitHub
            </button>
          </div>
        )}

        {step === 'polling' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Waiting for authorization</p>
              <p className="text-xs text-muted-foreground mt-1">Enter this code at {verificationUri}</p>
            </div>
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-5 py-3 w-full justify-center">
              <span className="text-2xl font-mono font-bold tracking-widest text-accent">{userCode}</span>
              <button onClick={handleCopy} title="Copy" className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => window.electronAPI?.github.openAuthUrl(verificationUri)}
              className="text-xs text-accent hover:underline"
            >
              Open browser →
            </button>
          </div>
        )}
      </div>

      {/* Skip */}
      <button
        onClick={onSkip}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip for now, use global git config
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  )
}
