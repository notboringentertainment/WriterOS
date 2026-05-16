import React, { useState, useEffect, useRef } from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'
import { SynopsisHeaderEditor } from './SynopsisHeaderEditor'
import { SynopsisLoglineEditor } from './SynopsisLoglineEditor'
import { SynopsisProseEditor } from './SynopsisProseEditor'
import { SynopsisQaChecklist } from './SynopsisQaChecklist'

export interface SynopsisEditViewProps {
  content: SynopsisDocumentContent
  composeMode: 'prose' | 'paragraphs'
  onContentPatch: (patch: Partial<SynopsisDocumentContent>) => void
  onComposeModeChange: (next: 'prose' | 'paragraphs') => void
  onClear: () => void
}

const CLEAR_TIMEOUT_MS = 3000

export function SynopsisEditView({
  content,
  composeMode,
  onContentPatch,
  onComposeModeChange,
  onClear,
}: SynopsisEditViewProps) {
  const [clearArmed, setClearArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  function handleClearClick() {
    if (!clearArmed) {
      setClearArmed(true)
      timerRef.current = setTimeout(() => {
        setClearArmed(false)
        timerRef.current = null
      }, CLEAR_TIMEOUT_MS)
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setClearArmed(false)
      onClear()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <SynopsisHeaderEditor
        value={content.header}
        onChange={(patch) => onContentPatch({ header: { ...content.header, ...patch } })}
      />

      <SynopsisLoglineEditor
        value={content.logline}
        onTextChange={(text) => onContentPatch({ logline: { ...content.logline, text } })}
      />

      <SynopsisProseEditor
        value={content.prose}
        mode={composeMode}
        onValueChange={(next) => onContentPatch({ prose: next })}
        onModeChange={onComposeModeChange}
      />

      <SynopsisQaChecklist
        value={content.qa}
        onToggle={(key, next) => onContentPatch({ qa: { ...content.qa, [key]: next } })}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <button
          onClick={handleClearClick}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: clearArmed ? 'var(--fg)' : 'var(--fg-muted)',
            background: clearArmed ? 'var(--surface-2)' : 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {clearArmed ? 'Click again to confirm' : 'Clear synopsis'}
        </button>
      </div>
    </div>
  )
}
