import React from 'react'
import { GuidedSection } from '../../shared/GuidedSection'

interface SynopsisPilotEditorProps {
  value: { logline: string; prose: string }
  onChange: (next: { logline: string; prose: string }) => void
}

export function SynopsisPilotEditor({ value, onChange }: SynopsisPilotEditorProps) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.field}>
        <label style={styles.label} htmlFor="pilot-logline">
          Pilot logline
        </label>
        <input
          id="pilot-logline"
          type="text"
          value={value.logline}
          onChange={e => onChange({ ...value, logline: e.target.value })}
          placeholder="One sentence capturing the pilot's central conflict…"
          style={styles.input}
        />
      </div>
      <GuidedSection
        label="Pilot synopsis"
        guidance="Tells a complete pilot story and shows why episode two exists."
        value={value.prose}
        onChange={prose => onChange({ ...value, prose })}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--fg-muted)',
  },
  input: {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--fg)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    boxSizing: 'border-box',
    outline: 'none',
  },
}
