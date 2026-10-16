import { normalizeProjectFormat } from '@shared/projectFormat'
import type { SurfaceAnswer, SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import { resolveFeatureRoleUnitIds } from '@shared/featureRoleBindings'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { getOutlineDeck, isOutlineCardAnswered, resolveOutlinePath } from './outlineDeck'
import { STORY_BIBLE_SECTIONS, fieldIsWritten, readField, sectionIsWritten, visibleFields } from './storyBibleSections'

export function buildSurfaceAwareness(activeTab: ActiveTab, state: ProjectState): SurfaceAwareness {
  const format = normalizeProjectFormat(state.meta.format)

  switch (activeTab) {
    case 'outline': {
      const content = state.documents.outline.content
      const resolution = format === 'feature' ? resolveFeatureRoleUnitIds(content) : undefined
      const questions: SurfaceQuestion[] = getOutlineDeck(format, resolution).map(card => {
        const bindings = typeof card.mappingPath === 'string'
          ? [{ path: card.mappingPath }]
          : card.mappingPath
        return {
          id: card.id,
          label: card.question,
          helper: card.helper,
          status: isOutlineCardAnswered(content, card) ? 'answered' : 'unanswered',
          answers: collectSurfaceAnswers(bindings.map(binding => ({
            label: 'label' in binding ? binding.label : undefined,
            value: resolveOutlinePath(content, binding.path),
          }))),
        }
      })
      return buildIntakeSurface('outline', 'Beat Sheet', format, questions)
    }

    case 'synopsis':
    case 'treatment':
      return { kind: 'none' }

    case 'story-bible': {
      const content = state.documents.storyBible.content
      const questions: SurfaceQuestion[] = STORY_BIBLE_SECTIONS.map(section => ({
        id: `story-bible-${section.id}`,
        label: section.title,
        helper: '',
        status: sectionIsWritten(section, content) ? 'answered' : 'unanswered',
        answers: collectSurfaceAnswers(
          section.special === 'characters'
            ? content.characters.filter(character => character.name.trim()).map(character => ({ label: character.name, value: character.role.trim() || 'character' }))
            : section.special === 'locks'
              ? content.locks.filter(lock => lock.status === 'active').map(lock => ({ value: lock.statement }))
              : visibleFields(section, content, format).filter(field => fieldIsWritten(content, field)).map(field => ({ label: field.label, value: readField(content, field.path) })),
        ),
      }))
      return buildIntakeSurface('story-bible', 'Story Bible', format, questions)
    }

    default:
      // 'whats-standing' and other future report surfaces land here — they have no intake deck
      return { kind: 'none' }
  }
}

function buildIntakeSurface(
  surface: Exclude<SurfaceAwareness, { kind: 'none' }>['surface'],
  surfaceTitle: string,
  format: Exclude<SurfaceAwareness, { kind: 'none' }>['format'],
  questions: SurfaceQuestion[],
): SurfaceAwareness {
  const answeredCount = questions.filter(q => q.status === 'answered').length
  const firstUnanswered = questions.find(q => q.status === 'unanswered') ?? null
  const allAnswered = firstUnanswered === null

  return {
    kind: 'intake',
    surface,
    surfaceTitle,
    format,
    questions,
    // When everything is answered, anchor to the first card so the agent can still name
    // the page context while nextRecommendedAction signals completion.
    nextQuestion: firstUnanswered ?? questions[0] ?? null,
    selectionSource: 'first_unanswered',
    answeredCount,
    totalCount: questions.length,
    nextRecommendedAction: allAnswered ? 'all_answered' : 'answer_next_question',
  }
}

function hasMeaningfulContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(item => hasMeaningfulContent(item))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      if (key === 'id' || key === 'label') return false
      return hasMeaningfulContent(child)
    })
  }
  return false
}

function collectSurfaceAnswers(
  values: ReadonlyArray<{ label?: string; value: unknown }>,
): SurfaceAnswer[] {
  return values.flatMap(({ label, value }) => {
    if (!hasMeaningfulContent(value)) return []
    const rendered = renderSurfaceAnswerValue(value)
    return rendered ? [{ ...(label ? { label } : {}), value: rendered }] : []
  })
}

function renderSurfaceAnswerValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
