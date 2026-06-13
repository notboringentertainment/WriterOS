import { normalizeProjectFormat } from '@shared/projectFormat'
import type { SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { FEATURE_DECK, isOutlineCardAnswered } from './outlineDeck'

// V1: serialize the feature Outline deck into a Surface Awareness Contract so agents can
// ground answers in "this question" / "the next unanswered thing". Series Outline and the
// other surfaces are deferred (see plan); they return `none` here.
export function buildSurfaceAwareness(activeTab: ActiveTab, state: ProjectState): SurfaceAwareness {
  if (activeTab !== 'outline') return { kind: 'none' }
  if (normalizeProjectFormat(state.meta.format) !== 'feature') return { kind: 'none' }

  const content = state.documents.outline.content
  const questions: SurfaceQuestion[] = FEATURE_DECK.map(card => ({
    id: card.id,
    label: card.question,
    helper: card.helper,
    status: isOutlineCardAnswered(content, card) ? 'answered' : 'unanswered',
  }))

  const answeredCount = questions.filter(q => q.status === 'answered').length
  const firstUnanswered = questions.find(q => q.status === 'unanswered') ?? null
  const allAnswered = firstUnanswered === null

  return {
    kind: 'intake',
    surface: 'outline',
    surfaceTitle: 'Outline',
    format: 'feature',
    questions,
    // When everything is answered there is no "next" — fall back to the first card so the
    // agent still has an anchor, and signal completion via nextRecommendedAction.
    nextQuestion: firstUnanswered ?? questions[0] ?? null,
    selectionSource: 'first_unanswered',
    answeredCount,
    totalCount: questions.length,
    nextRecommendedAction: allAnswered ? 'all_answered' : 'answer_next_question',
  }
}
