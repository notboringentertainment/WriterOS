import React from 'react'
import type { StoryBibleDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import { deriveStoryBibleReadiness } from '../../../lib/storyBibleReadiness'

export interface StoryBibleReadinessReviewProps {
  format: ProjectFormat
  content: StoryBibleDocumentContent
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

export function StoryBibleReadinessReview({
  format,
  content,
}: StoryBibleReadinessReviewProps) {
  const checks = deriveStoryBibleReadiness(content, format)

  return (
    <section
      style={sectionStyle}
      aria-label="Story Bible readiness review"
      data-testid="story-bible-readiness-review"
    >
      <h3 style={headingStyle}>Reader check</h3>
      <p style={blurbStyle}>
        Derived from your answers. Use these questions before treating the bible as shareable.
      </p>
      {checks.map((check) => (
        <div key={check.id} style={rowStyle}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: check.satisfied
                ? 'var(--success, #4caf50)'
                : 'var(--surface-2, #ddd)',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          />
          <span>{check.question}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
            {check.satisfied ? 'looks good' : 'needs work'}
          </span>
        </div>
      ))}
    </section>
  )
}
