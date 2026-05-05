import React from 'react'

interface GuidedSectionProps {
  label: string
  guidance: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function GuidedSection({ label, guidance, value, onChange, placeholder }: GuidedSectionProps) {
  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
      </div>
      {guidance && (
        <p style={styles.guidance}>{guidance}</p>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || `Write your ${label.toLowerCase()}…`}
        style={styles.textarea}
        rows={4}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--fg)',
  },
  guidance: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  textarea: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.7,
    padding: '10px 14px',
    outline: 'none',
    transition: 'border-color 120ms',
  },
}
