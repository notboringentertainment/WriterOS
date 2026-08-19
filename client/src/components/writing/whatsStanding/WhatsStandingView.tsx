// Block rendering here reuses the shared composed-block primitives (see
// ../shared/ComposedBlocks), extended only so a leadInParagraph with an open
// question renders its QuestionCard right beneath it — an in-place answer,
// not a separate review queue.
import React, { useMemo } from 'react'
import type { EnrichedQuestion, WhatsStandingPayload } from '@shared/whatsStandingPanel'
import { QuestionCard, type WhatsStandingAnswer } from './QuestionCard'
import { Block, metaStyle, subheadingStyle } from '../shared/ComposedBlocks'

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
          // Key by the annotation id when the block carries one, not by array index: if the
          // block array shifts between renders, an index key would let a QuestionCard's
          // selected-candidates state migrate onto a different question.
          const key = block.type === 'leadInParagraph' && block.annotationId ? block.annotationId : `block-${i}`
          return (
            <React.Fragment key={key}>
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
