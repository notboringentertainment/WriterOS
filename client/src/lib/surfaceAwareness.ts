import { normalizeProjectFormat } from '@shared/projectFormat'
import { visibleOutlineUnits } from './outlineDeck'
import type { SurfaceAnswer, SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { STORY_BIBLE_SECTIONS, fieldIsWritten, readField, sectionIsWritten, visibleFields } from './storyBibleSections'

export function buildSurfaceAwareness(activeTab: ActiveTab, state: ProjectState): SurfaceAwareness {
  const format = normalizeProjectFormat(state.meta.format)

  switch (activeTab) {
    case 'outline': {
      // Only Story-drive's beats: the foundation questions and hand-written beat cards
      // are no longer on the page, so they are no longer offered as questions.
      const content = state.documents.outline.content
      if (!content.beatSheetSource) return { kind: 'none' }
      const questions: SurfaceQuestion[] = [...visibleOutlineUnits(content, format)].sort((x, y) => x.number - y.number).map(unit => ({
        id: unit.id,
        label: `${unit.number}. ${unit.title}`,
        helper: unit.actOrSequence,
        status: unit.whatHappens.trim() ? 'answered' : 'unanswered',
        answers: collectSurfaceAnswers([{ value: unit.whatHappens }]),
      }))
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
      return buildIntakeSurface('story-bible', 'Story Facts', format, questions)
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
