'use client'

import { useEffect } from 'react'

export function ZoomHandler() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const api = (window as any).electronAPI
      if (e.deltaY < 0) api?.zoomIn()
      else api?.zoomOut()
    }

    const clearSelection = () => window.getSelection()?.removeAllRanges()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        e.preventDefault()
        const root = active?.closest('pre, code, [contenteditable="true"], [contenteditable=""], .selectable') ?? document.body
        const selection = window.getSelection()
        if (!selection) return
        const range = document.createRange()
        range.selectNodeContents(root)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('mousedown', clearSelection, { capture: true })
    document.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('blur', clearSelection)
    return () => {
      window.removeEventListener('wheel', onWheel)
      document.removeEventListener('mousedown', clearSelection, { capture: true })
      document.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('blur', clearSelection)
    }
  }, [])

  return null
}
