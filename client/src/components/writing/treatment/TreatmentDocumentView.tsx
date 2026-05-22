import React from 'react'
import type { TreatmentDocumentContent, TreatmentMainCharacter } from '@shared/documents'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'

export interface TreatmentDocumentViewProps {
  content: TreatmentDocumentContent
  projectFormat?: ProjectFormat
  updatedAt: string
}

type ConceptField = keyof TreatmentDocumentContent['concept']
type ProseField = Exclude<keyof TreatmentDocumentContent['prose'], 'customSections'>
type VisualField = keyof TreatmentDocumentContent['visualAndTonal']

const FORMAT_LABELS: Record<ProjectFormat, string> = {
  feature: 'Feature',
  series: 'Series',
}

const METADATA_LABELS: Array<{ key: keyof TreatmentDocumentContent['header']; label: string }> = [
  { key: 'writer', label: 'WRITER' },
  { key: 'format', label: 'FORMAT' },
  { key: 'genre', label: 'GENRE' },
  { key: 'version', label: 'VERSION' },
  { key: 'date', label: 'DATE' },
]

const CONCEPT_FIELDS: Array<{ key: ConceptField; label: string }> = [
  { key: 'premise', label: 'Premise' },
  { key: 'tone', label: 'Tone' },
  { key: 'theme', label: 'Theme' },
  { key: 'emotionalPromise', label: 'Emotional Promise' },
]

const PROSE_SECTIONS: Array<{ key: ProseField; heading: string }> = [
  { key: 'opening', heading: 'Opening' },
  { key: 'actOne', heading: 'Act One' },
  { key: 'actTwo', heading: 'Act Two' },
  { key: 'actThree', heading: 'Act Three' },
]

const CHARACTER_FIELDS: Array<{
  key: Exclude<keyof TreatmentMainCharacter, 'id' | 'name' | 'role'>
  label: string
}> = [
  { key: 'externalWant', label: 'Want' },
  { key: 'internalNeed', label: 'Need' },
  { key: 'flawOrWound', label: 'Wound' },
  { key: 'secretOrContradiction', label: 'Secret or Contradiction' },
  { key: 'arc', label: 'Arc' },
  { key: 'relationshipPressure', label: 'Relationship Pressure' },
]

const TEXTURE_FIELDS: Array<{ key: VisualField; label: string }> = [
  { key: 'overallTone', label: 'Overall Tone' },
  { key: 'visualWorld', label: 'Visual World' },
  { key: 'recurringImagesOrMotifs', label: 'Recurring Images or Motifs' },
  { key: 'musicOrSoundFeeling', label: 'Music or Sound Feeling' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'genreRules', label: 'Genre Rules' },
  { key: 'compsAndReferences', label: 'Comps and References' },
]

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
  margin: 0,
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  lineHeight: 1.75,
  color: 'var(--fg)',
  margin: 0,
  whiteSpace: 'pre-line',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  paddingTop: 2,
}

const valueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--fg)',
  lineHeight: 1.55,
}

function text(value: string): string {
  return value.trim()
}

function paragraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
}

function hasCharacterText(character: TreatmentMainCharacter): boolean {
  return Object.entries(character).some(
    ([key, value]) => key !== 'id' && typeof value === 'string' && value.trim().length > 0,
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={sectionHeadingStyle}>{heading}</h2>
      {children}
    </section>
  )
}

function Paragraphs({ value }: { value: string }) {
  return (
    <>
      {paragraphs(value).map((paragraph, index) => (
        <p key={index} style={bodyStyle}>
          {paragraph}
        </p>
      ))}
    </>
  )
}

function DetailRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        gap: '6px 16px',
      }}
    >
      {rows.map(row => (
        <React.Fragment key={row.label}>
          <span style={labelStyle}>{row.label}</span>
          <span style={valueStyle}>{row.value}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

export function TreatmentDocumentView({ content, projectFormat, updatedAt }: TreatmentDocumentViewProps) {
  const activeFormat = normalizeProjectFormat(projectFormat)
  const title = text(content.header.title)
  const logline = text(content.logline)
  const conceptRows = CONCEPT_FIELDS
    .map(({ key, label }) => ({ label, value: text(content.concept[key]) }))
    .filter(row => row.value.length > 0)
  const hasAuthoredHeaderMetadata = Boolean(
    text(content.header.writer) ||
    text(content.header.genre) ||
    text(content.header.version) ||
    text(content.header.date),
  )
  const characters = content.mainCharacters.filter(hasCharacterText)
  const proseSections = PROSE_SECTIONS
    .map(({ key, heading }) => ({ heading, value: text(content.prose[key]) }))
    .filter(section => section.value.length > 0)
  const customSections = content.prose.customSections
    .map(section => ({
      id: section.id,
      heading: text(section.heading) || 'Additional Passage',
      body: text(section.body),
    }))
    .filter(section => section.body.length > 0)
  const textureRows = TEXTURE_FIELDS
    .map(({ key, label }) => ({ label, value: text(content.visualAndTonal[key]) }))
    .filter(row => row.value.length > 0)
  const hasAuthoredBody = Boolean(
    title ||
    hasAuthoredHeaderMetadata ||
    logline ||
    conceptRows.length > 0 ||
    characters.length > 0 ||
    proseSections.length > 0 ||
    customSections.length > 0 ||
    textureRows.length > 0,
  )
  const metadataRows = METADATA_LABELS
    .map(({ key, label }) => {
      const value = key === 'format' ? FORMAT_LABELS[activeFormat] : text(content.header[key])
      return { label, value }
    })
    .filter(row => row.value.length > 0 && (row.label !== 'FORMAT' || hasAuthoredBody))
  const formattedDate = new Date(updatedAt).toLocaleDateString()

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
      {!hasAuthoredBody ? (
        <p
          style={{
            ...bodyStyle,
            color: 'var(--fg-muted)',
            fontStyle: 'italic',
          }}
        >
          No authored treatment content yet.
        </p>
      ) : (
        <>
          {title && (
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
              {title}
            </h1>
          )}

          {logline && (
            <p
              style={{
                ...bodyStyle,
                fontStyle: 'italic',
              }}
            >
              {logline}
            </p>
          )}

          {metadataRows.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                padding: '16px 0',
              }}
            >
              <DetailRows rows={metadataRows} />
            </div>
          )}

          {conceptRows.length > 0 && (
            <Section heading="Promise">
              <DetailRows rows={conceptRows} />
            </Section>
          )}

          {characters.length > 0 && (
            <Section heading="Characters">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {characters.map((character, index) => {
                  const name = text(character.name) || `Character ${index + 1}`
                  const role = text(character.role)
                  const rows = CHARACTER_FIELDS
                    .map(({ key, label }) => ({ label, value: text(character[key]) }))
                    .filter(row => row.value.length > 0)
                  return (
                    <article key={character.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <h3
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: 'var(--fg)',
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {name}
                        </h3>
                        {role && (
                          <p style={{ ...bodyStyle, fontSize: '0.9375rem', fontStyle: 'italic' }}>
                            {role}
                          </p>
                        )}
                      </div>
                      <DetailRows rows={rows} />
                    </article>
                  )
                })}
              </div>
            </Section>
          )}

          {(proseSections.length > 0 || customSections.length > 0) && (
            <Section heading="Story">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {proseSections.map(section => (
                  <article key={section.heading} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--fg)',
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {section.heading}
                    </h3>
                    <Paragraphs value={section.value} />
                  </article>
                ))}
                {customSections.map(section => (
                  <article key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--fg)',
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {section.heading}
                    </h3>
                    <Paragraphs value={section.body} />
                  </article>
                ))}
              </div>
            </Section>
          )}

          {textureRows.length > 0 && (
            <Section heading="Texture">
              <DetailRows rows={textureRows} />
            </Section>
          )}
        </>
      )}

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
