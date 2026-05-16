import React from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'

export interface SynopsisDocumentViewProps {
  content: SynopsisDocumentContent
  updatedAt: string
}

const PROSE_FIELDS: Array<keyof SynopsisDocumentContent['prose']> = [
  'opening',
  'escalation',
  'middle',
  'climax',
  'resolution',
]

const METADATA_LABELS: Array<{ key: keyof SynopsisDocumentContent['header']; label: string }> = [
  { key: 'title', label: 'TITLE' },
  { key: 'writer', label: 'WRITER' },
  { key: 'format', label: 'FORMAT' },
  { key: 'genre', label: 'GENRE' },
  { key: 'targetRuntime', label: 'RUNTIME' },
]

export function SynopsisDocumentView({ content, updatedAt }: SynopsisDocumentViewProps) {
  const { header, logline, prose } = content

  const showMetadata = Boolean(header.title || header.writer)

  const paragraphs = PROSE_FIELDS.map(f => prose[f]).filter(Boolean)

  const formattedDate = new Date(updatedAt).toLocaleDateString()

  const compsDisplay = header.comps && header.comps.length > 0 ? header.comps.join(', ') : ''

  return (
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {/* Title */}
      {header.title && (
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            fontWeight: 700,
            color: 'var(--fg)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {header.title}
        </h1>
      )}

      {/* Logline */}
      {logline.text && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            fontStyle: 'italic',
            color: 'var(--fg)',
            margin: 0,
            lineHeight: 1.7,
          }}
        >
          {logline.text}
        </p>
      )}

      {/* Metadata block */}
      {showMetadata && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            padding: '16px 0',
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '4px 16px',
          }}
        >
          {METADATA_LABELS.map(({ key, label }) => {
            const val = header[key as keyof typeof header]
            if (!val || (Array.isArray(val) && val.length === 0)) return null
            const display = Array.isArray(val) ? (val as string[]).join(', ') : String(val)
            return (
              <React.Fragment key={key}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    letterSpacing: '0.1em',
                    color: 'var(--fg-muted)',
                    textTransform: 'uppercase',
                    paddingTop: 2,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    color: 'var(--fg)',
                  }}
                >
                  {display}
                </span>
              </React.Fragment>
            )
          })}
          {compsDisplay && (
            <React.Fragment>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  letterSpacing: '0.1em',
                  color: 'var(--fg-muted)',
                  textTransform: 'uppercase',
                  paddingTop: 2,
                }}
              >
                COMPS
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--fg)',
                }}
              >
                {compsDisplay}
              </span>
            </React.Fragment>
          )}
        </div>
      )}

      {/* Prose paragraphs */}
      {paragraphs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {paragraphs.map((para, i) => (
            <p
              key={i}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                lineHeight: 1.75,
                color: 'var(--fg)',
                margin: 0,
              }}
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          color: 'var(--fg-muted)',
          margin: 0,
        }}
      >
        Last edited {formattedDate}
      </p>
    </div>
  )
}
