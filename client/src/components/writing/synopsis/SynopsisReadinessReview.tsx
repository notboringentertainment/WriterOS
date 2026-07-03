import React from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import {
  FEATURE_READINESS_CHECKS,
  deriveSeriesReadiness,
} from '../../../lib/synopsisReadiness'

export interface SynopsisReadinessReviewProps {
  format: ProjectFormat
  content: SynopsisDocumentContent
  onToggleFeatureCheck?: (
    key: keyof SynopsisDocumentContent['qa'],
    next: boolean,
  ) => void
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '20px 0',
  borderTop: '1px solid var(--border-subtle, var(--border))',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.75rem',
  color: 'var(--fg-subtle)',
  margin: 0,
}

const blurbStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  color: 'var(--fg-muted)',
  margin: 0,
  lineHeight: 1.5,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  color: 'var(--fg)',
}

export function SynopsisReadinessReview({
  format,
  content,
  onToggleFeatureCheck,
}: SynopsisReadinessReviewProps) {
  if (format === 'feature') {
    return (
      <section
        style={sectionStyle}
        aria-label="Synopsis readiness review"
        data-testid="synopsis-readiness-review"
      >
        <h3 style={headingStyle}>Reader check</h3>
        <p style={blurbStyle}>
          Quick reader-facing review. Helps you spot common synopsis problems before sharing.
        </p>
        {FEATURE_READINESS_CHECKS.map((c) => (
          <label key={c.id} style={rowStyle}>
            <input
              type="checkbox"
              checked={content.qa[c.id]}
              onChange={(e) => onToggleFeatureCheck?.(c.id, e.target.checked)}
            />
            <span>{c.question}</span>
          </label>
        ))}
      </section>
    )
  }

  const derived = deriveSeriesReadiness(content)
  return (
    <section
      style={sectionStyle}
      aria-label="Synopsis readiness review"
      data-testid="synopsis-readiness-review"
    >
      <h3 style={headingStyle}>Reader check</h3>
      <p style={blurbStyle}>
        Derived from your answers. Use these as a quick pass before sharing the pitch.
      </p>
      {derived.map((c) => (
        <div key={c.id} style={rowStyle}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: c.satisfied
                ? 'var(--success, #4caf50)'
                : 'var(--surface-2, #ddd)',
              border: '1px solid var(--border)',
            }}
          />
          <span>{c.question}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
            {c.satisfied ? 'looks good' : 'needs work'}
          </span>
        </div>
      ))}
    </section>
  )
}
