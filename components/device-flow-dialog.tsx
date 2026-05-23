'use client'

import { useState } from 'react'
import { X, Github, Loader2, Copy, Check as CheckIcon } from 'lucide-react'
import { toast } from 'sonner'

interface DeviceFlowDialogProps {
  open: boolean
  onClose: () => void
  onAuth: (user: GitHubAccount) => void
}

export function DeviceFlowDialog({ open, onClose, onAuth }: DeviceFlowDialogProps) {
  const [step, setStep] = useState<'idle' | 'polling'>('idle')
  const [userCode, setUserCode] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [copied, setCopied] = useState(false)

  if (!open) return null

  async function handleStart() {
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
          setStep('idle')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg w-96 shadow-xl">
        <div className="flex items-center justify-between px-4 h-10 border-b border-border">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Add GitHub account</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'idle' && (
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Github className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Connect a GitHub account</p>
              <p className="text-xs text-muted-foreground mt-1">Sign in to add another account</p>
            </div>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Github className="h-4 w-4" />
              Sign in with GitHub
            </button>
          </div>
        )}

        {step === 'polling' && (
          <div className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Waiting for authorization</p>
              <p className="text-xs text-muted-foreground mt-1">Enter this code in your browser:</p>
            </div>
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-5 py-3">
              <span className="text-xl font-mono font-bold tracking-widest text-accent">{userCode}</span>
              <button onClick={handleCopy} title="Copy code" className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={() => window.electronAPI?.github.openAuthUrl(verificationUri)}
              className="text-xs text-accent hover:underline"
            >
              Open {verificationUri}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
