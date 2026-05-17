import React, { useEffect, useState } from 'react'

interface Props {
  visible: boolean
  durationMs?: number
}

export function SavedToast({ visible, durationMs = 1500 }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!visible) return
    setShow(true)
    const id = setTimeout(() => setShow(false), durationMs)
    return () => clearTimeout(id)
  }, [visible, durationMs])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        ...styles.toast,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(-4px)',
        pointerEvents: 'none',
      }}
    >
      Saved ✓
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '3px 8px',
    whiteSpace: 'nowrap',
    transition: 'opacity 180ms ease, transform 180ms ease',
  },
}
