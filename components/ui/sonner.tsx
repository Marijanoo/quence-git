'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg':      'var(--popover)',
          '--normal-text':    'var(--popover-foreground)',
          '--normal-border':  'var(--border)',
          '--success-bg':     'var(--popover)',
          '--success-text':   'var(--primary)',
          '--success-border': 'var(--border)',
          '--error-bg':       'var(--popover)',
          '--error-text':     'var(--destructive)',
          '--error-border':   'var(--border)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: '!font-sans !text-xs !rounded-md !border-border !shadow-lg',
          title: '!text-xs !font-medium',
          actionButton: '!bg-primary !text-primary-foreground hover:!opacity-90 !text-xs',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
