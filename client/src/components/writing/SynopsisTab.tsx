import React from 'react'
import { GuidedSection } from '../shared/GuidedSection'

interface SynopsisData {
  logline: string
  sections: {
    setup: string
    act1Break: string
    midpoint: string
    act2Break: string
    resolution: string
  }
}

interface SynopsisTabProps {
  synopsis: SynopsisData
  onUpdate: (key: string, value: string) => void
}

const SYNOPSIS_SECTIONS = [
  {
    key: 'logline',
    label: 'Logline',
    guidance: '1–2 sentences. Character + goal + obstacle + stakes. Present tense, third person.',
    placeholder: 'When [protagonist] discovers [inciting incident], they must [goal] before [stakes].',
  },
  {
    key: 'setup',
    label: 'Setup',
    guidance: 'Who is the protagonist? Where and when is this set? What is the inciting incident that disrupts their world?',
    placeholder: "Establish the world and the protagonist's life before everything changes…",
  },
  {
    key: 'act1Break',
    label: 'Act One Break',
    guidance: 'The moment the protagonist commits to the journey. No going back. What is the decision, and what does it cost them?',
    placeholder: 'The protagonist chooses to…',
  },
  {
    key: 'midpoint',
    label: 'Midpoint',
    guidance: 'False victory or false defeat. Stakes escalate. The protagonist can no longer avoid the central conflict.',
    placeholder: 'Halfway through, it seems like…',
  },
  {
    key: 'act2Break',
    label: 'Act Two Break',
    guidance: "All is lost. The protagonist's lowest moment — a death (literal or symbolic), a failure, a betrayal.",
    placeholder: 'Everything falls apart when…',
  },
  {
    key: 'resolution',
    label: 'Resolution',
    guidance: 'How does the protagonist defeat the antagonist? How have they changed? What is the final image of the world?',
    placeholder: 'In the end…',
  },
]

export function SynopsisTab({ synopsis, onUpdate }: SynopsisTabProps) {
  const getValue = (key: string): string => {
    if (key === 'logline') return synopsis.logline
    return synopsis.sections[key as keyof typeof synopsis.sections] ?? ''
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Synopsis</h2>
        <p style={styles.subtitle}>
          A pitch-facing story spine: logline, turns, stakes, and ending in compressed prose. Writing Partner naturally asks @Sam here.
        </p>
      </div>
      <div style={styles.sections}>
        {SYNOPSIS_SECTIONS.map(section => (
          <GuidedSection
            key={section.key}
            label={section.label}
            guidance={section.guidance}
            placeholder={section.placeholder}
            value={getValue(section.key)}
            onChange={value => onUpdate(section.key, value)}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  header: { marginBottom: 28 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  sections: { display: 'flex', flexDirection: 'column', gap: 16 },
}
