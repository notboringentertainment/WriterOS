// Style constants and the private Block switch are a fourth copy of
// SynopsisDocumentView.tsx's rendering primitives (per the plan's explicit
// non-goal of not extracting a shared renderer yet), extended only so a
// leadInParagraph with an open question renders its QuestionCard right
// beneath it — an in-place answer, not a separate review queue.
import React, { useMemo } from 'react'
import type { ComposedBlock } from '@shared/compose/types'
import type { EnrichedQuestion, WhatsStandingPayload } from '@shared/whatsStandingPanel'
import { QuestionCard, type WhatsStandingAnswer } from './QuestionCard'

export interface WhatsStandingViewProps {
  payload: WhatsStandingPayload
  answeringId: string | null
  notice: string | null
  onAnswer: (annotationId: string, questionVersion: string, answer: WhatsStandingAnswer) => void
}

const pageStyle: React.CSSProperties = {
  maxWidth: 680, margin: '0 auto', padding: '48px 24px',
  display: 'flex', flexDirection: 'column', gap: 24,
}
const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700,
  color: 'var(--fg)', margin: 0, lineHeight: 1.25,
}
const subheadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}
const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.75, color: 'var(--fg)', margin: 0,
}
const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}

function formatLead(lead: string): string {
  const trimmed = lead.trim()
  return /[.!?:]$/.test(trimmed) ? `${trimmed} ` : `${trimmed}. `
}

// Renderer purity: the body emits ONLY composed text. It never reads
// sourceFieldIds, recipe labels, fidelity warnings, or answer ids.
function Block({ block }: { block: ComposedBlock }) {
  switch (block.type) {
    case 'heading': return <h2 style={headingStyle}>{block.text}</h2>
    case 'subheading': return <h3 style={subheadingStyle}>{block.text}</h3>
    case 'divider': return <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
    case 'meta': return <p style={metaStyle}>{block.text}</p>
    case 'logline': return <p style={{ ...bodyStyle, fontStyle: 'italic' }}>{block.text}</p>
    case 'paragraph': return <p style={bodyStyle}>{block.text}</p>
    case 'leadInParagraph': return <p style={bodyStyle}><strong>{formatLead(block.lead)}</strong>{block.text}</p>
    default: return null
  }
}

const CANT_SAY_MARKER = '(cant-say)'
const PARKED_LINE = 'Parked: you answered can’t say; this reopens if the wording changes.'
const OTHER_WARNINGS_LINE = 'Review: some lines may not match your answers. Structure-checked, not meaning-verified.'

export function WhatsStandingView({ payload, answeringId, notice, onAnswer }: WhatsStandingViewProps) {
  const { composed, questions } = payload

  const questionsByAnnotation = useMemo(() => {
    const map = new Map<string, EnrichedQuestion>()
    for (const question of questions) map.set(question.annotationId, question)
    return map
  }, [questions])

  const matchedAnnotationIds = new Set<string>()
  for (const block of composed.blocks) {
    if (block.type === 'leadInParagraph' && block.annotationId && questionsByAnnotation.has(block.annotationId)) {
      matchedAnnotationIds.add(block.annotationId)
    }
  }
  const fallbackQuestions = questions.filter(question => !matchedAnnotationIds.has(question.annotationId))

  const unresolvedWarnings = composed.fidelity.warnings.filter(w => w.kind === 'unresolved_reference')
  const cantSayWarnings = unresolvedWarnings.filter(w => w.message.includes(CANT_SAY_MARKER))
  const hasOtherWarnings = composed.fidelity.warnings.some(w => w.kind !== 'unresolved_reference')
  const disabled = answeringId !== null

  return (
    <div style={pageStyle}>
      {composed.fidelity.status !== 'clean' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {unresolvedWarnings.length > 0 && (
            <p style={metaStyle}>
              {unresolvedWarnings.length} reference{unresolvedWarnings.length === 1 ? '' : 's'} unresolved
            </p>
          )}
          {cantSayWarnings.map((warning, i) => (
            <p key={`cant-say-${i}`} style={metaStyle}>{PARKED_LINE}</p>
          ))}
          {hasOtherWarnings && <p style={metaStyle}>{OTHER_WARNINGS_LINE}</p>}
        </div>
      )}
      {notice && <p style={metaStyle}>{notice}</p>}
      <article style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {composed.blocks.map((block, i) => {
          const question = block.type === 'leadInParagraph' && block.annotationId
            ? questionsByAnnotation.get(block.annotationId)
            : undefined
          return (
            <React.Fragment key={i}>
              <Block block={block} />
              {question && <QuestionCard question={question} disabled={disabled} onAnswer={onAnswer} />}
            </React.Fragment>
          )
        })}
      </article>
      {fallbackQuestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={subheadingStyle}>Still needs an answer</h3>
          {fallbackQuestions.map(question => (
            <QuestionCard key={question.annotationId} question={question} disabled={disabled} onAnswer={onAnswer} />
          ))}
        </div>
      )}
    </div>
  )
}
