'use client'

import { useEffect } from 'react'

/**
 * useEscClose — adds a keydown listener that calls `onClose` when the ESC
 * key is pressed. Designed for modal dialogs that are conditionally rendered
 * (i.e. the component is only mounted while the dialog is open, so the
 * listener is automatically cleaned up on unmount).
 *
 * Usage (inside any dialog component):
 *   function MyDialog({ onClose }: { onClose: () => void }) {
 *     useEscClose(onClose)
 *     return <div className="fixed inset-0 ...">...</div>
 *   }
 *
 * The listener is added on mount and removed on unmount. If `onClose` changes
 * between renders, the listener is re-bound to the latest callback (via the
 * dependency array).
 *
 * If `active` is false, no listener is attached — useful for dialogs that
 * stay mounted but should only respond to ESC when visible (rare in this
 * codebase since most dialogs are conditionally rendered).
 */
export function useEscClose(onClose: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, active])
}
