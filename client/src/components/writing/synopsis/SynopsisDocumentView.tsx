import React from 'react'
import type { SynopsisDocumentContent, SynopsisSeriesContent } from '@shared/documents'

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

const SERIES_TYPE_LABELS: Record<string, string> = {
  limited: 'Limited',
  ongoing: 'Ongoing',
}

const EPISODE_LENGTH_LABELS: Record<string, string> = {
  half_hour: 'Half-hour',
  hour: 'Hour',
  other: 'Other',
}

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
  margin: 0,
}

const sectionBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  lineHeight: 1.75,
  color: 'var(--fg)',
  margin: 0,
}

const metaLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  paddingTop: 2,
}

const metaValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--fg)',
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={sectionHeadingStyle}>{heading}</h2>
      {children}
    </div>
  )
}

function seriesHasCharacter(c: SynopsisSeriesContent['characters'][number]): boolean {
  return Boolean(c.name || c.role || c.bio || c.arcPerSeason.some(Boolean))
}

export function SynopsisDocumentView({ content, updatedAt }: SynopsisDocumentViewProps) {
  const { header, logline, prose } = content

  const isSeriesMode = header.format === 'series' && content.series !== undefined
  const series = content.series

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
            // Hide RUNTIME row in series mode
            if (isSeriesMode && key === 'targetRuntime') return null
            const val = header[key as keyof typeof header]
            if (!val || (Array.isArray(val) && val.length === 0)) return null
            const display = Array.isArray(val) ? (val as string[]).join(', ') : String(val)
            return (
              <React.Fragment key={key}>
                <span style={metaLabelStyle}>{label}</span>
                <span style={metaValueStyle}>{display}</span>
              </React.Fragment>
            )
          })}

          {/* Series-only rows */}
          {isSeriesMode && series && series.seriesType && (
            <React.Fragment>
              <span style={metaLabelStyle}>SERIES TYPE</span>
              <span style={metaValueStyle}>{SERIES_TYPE_LABELS[series.seriesType] ?? series.seriesType}</span>
            </React.Fragment>
          )}
          {isSeriesMode && series && series.episodeLength && (
            <React.Fragment>
              <span style={metaLabelStyle}>EPISODE LENGTH</span>
              <span style={metaValueStyle}>{EPISODE_LENGTH_LABELS[series.episodeLength] ?? series.episodeLength}</span>
            </React.Fragment>
          )}

          {compsDisplay && (
            <React.Fragment>
              <span style={metaLabelStyle}>COMPS</span>
              <span style={metaValueStyle}>{compsDisplay}</span>
            </React.Fragment>
          )}
        </div>
      )}

      {/* Series sections */}
      {isSeriesMode && series ? (
        <>
          {/* Show Overview */}
          {series.showOverview.trim() && (
            <Section heading="Show Overview">
              <p style={sectionBodyStyle}>{series.showOverview}</p>
            </Section>
          )}

          {/* Pilot Synopsis */}
          {(series.pilot.logline.trim() || series.pilot.prose.trim()) && (
            <Section heading="Pilot Synopsis">
              {series.pilot.logline.trim() && (
                <p style={{ ...sectionBodyStyle, fontStyle: 'italic' }}>{series.pilot.logline}</p>
              )}
              {series.pilot.prose
                .split('\n\n')
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} style={sectionBodyStyle}>{para}</p>
                ))}
            </Section>
          )}

          {/* Season One Arc */}
          {series.seasonOneArc.trim() && (
            <Section heading="Season One Arc">
              <p style={sectionBodyStyle}>{series.seasonOneArc}</p>
            </Section>
          )}

          {/* Where It Goes */}
          {series.futureSeasons.some(s => s.label.trim() || s.summary.trim()) && (
            <Section heading="Where It Goes">
              {series.futureSeasons
                .filter(s => s.label.trim() || s.summary.trim())
                .map((s, i) => (
                  <div key={s.id}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--fg)',
                        margin: '0 0 4px 0',
                      }}
                    >
                      {s.label.trim() || `Season ${i + 2}`}
                    </h3>
                    {s.summary && <p style={sectionBodyStyle}>{s.summary}</p>}
                  </div>
                ))}
            </Section>
          )}

          {/* Characters */}
          {series.characters.some(seriesHasCharacter) && (
            <Section heading="Characters">
              {series.characters.filter(seriesHasCharacter).map(char => (
                <div key={char.id}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--fg)',
                      margin: '0 0 4px 0',
                    }}
                  >
                    {char.name || '(unnamed)'}
                  </h3>
                  {char.role && (
                    <p style={{ ...sectionBodyStyle, fontStyle: 'italic' }}>{char.role}</p>
                  )}
                  {char.bio && <p style={sectionBodyStyle}>{char.bio}</p>}
                  {char.arcPerSeason.some(Boolean) && (
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                      {char.arcPerSeason.filter(Boolean).map((arc, i) => (
                        <li
                          key={i}
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.9375rem',
                            lineHeight: 1.7,
                            color: 'var(--fg)',
                          }}
                        >
                          {arc}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Comps & Why This Show Now */}
          {series.compsAndWhyThisShowNow.trim() && (
            <Section heading="Comps & Why This Show Now">
              <p style={sectionBodyStyle}>{series.compsAndWhyThisShowNow}</p>
            </Section>
          )}
        </>
      ) : (
        /* Feature prose paragraphs */
        paragraphs.length > 0 && (
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
        )
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
