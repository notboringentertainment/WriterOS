import type { SurfaceAwareness } from './surfaceAwareness'

export function renderSurfaceAwareness(surface: SurfaceAwareness): string {
  if (surface.kind !== 'intake') return ''
  const lines = [
    'SURFACE AWARENESS (live app state from WriterOS; use silently as grounding unless the writer asks where they are):',
    `- Current app surface: ${surface.surfaceTitle} (${surface.format}).`,
    `- Progress: ${surface.answeredCount}/${surface.totalCount} questions answered.`,
  ]
  if (surface.nextQuestion) {
    const question = surface.nextQuestion
    const label = surface.nextRecommendedAction === 'all_answered'
      ? `- Every question is answered. The first question is "${question.label}" - ${question.helper}`
      : `- Next unanswered question: "${question.label}" - ${question.helper}`
    lines.push(label)
  }
  if (surface.questions.length) {
    lines.push(
      'QUESTION DECK ORDER:',
      ...surface.questions.map((question, index) => (
        `${index + 1}. [${question.status}] ${question.label} - ${question.helper}`
      )),
    )
  }
  lines.push(
    `- You DO have this page's structured state from the app. Ground answers in it, but do not open by announcing the surface, page, or location. Mention the surface name only if the writer asks where they are, asks what page/surface this is, or the answer would otherwise be ambiguous. If the writer asks for an ordinal question (for example "second question" or "question 2"), use QUESTION DECK ORDER rather than assuming they mean the next unanswered question. Do NOT say or claim you cannot see, access, or view the page - you have its state. (You still cannot inspect pixels or unlisted fields, so do not invent visual details beyond this data.)`,
  )
  return lines.join('\n')
}
