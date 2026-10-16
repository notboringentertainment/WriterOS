import { normalizeProjectFormat } from '@shared/projectFormat'
import type { SurfaceAnswer, SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import { createEmptyStoryBibleContent } from '@shared/documents'
import { resolveFeatureRoleUnitIds } from '@shared/featureRoleBindings'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { getOutlineDeck, isOutlineCardAnswered, resolveOutlinePath } from './outlineDeck'
import {
  getDeckForFormat as getStoryBibleDeck,
  resolveStoryBiblePath,
  type StoryBiblePromptDef,
} from './storyBibleDeck'

const EMPTY_STORY_BIBLE_CONTENT = createEmptyStoryBibleContent()

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
      const questions: SurfaceQuestion[] = getStoryBibleDeck(format).map(prompt => ({
        id: prompt.id,
        label: prompt.question,
        helper: prompt.helper,
        status: isStoryBiblePromptAnswered(content, prompt) ? 'answered' : 'unanswered',
        answers: collectSurfaceAnswers(prompt.inputs.map(input => {
          const resolved = resolveStoryBiblePath(content, input.path)
          const emptyResolved = resolveStoryBiblePath(EMPTY_STORY_BIBLE_CONTENT, input.path)
          return {
            label: input.label,
            value: emptyResolved.defined && sameValue(resolved.value, emptyResolved.value)
              ? undefined
              : resolved.value,
          }
        })),
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

function isStoryBiblePromptAnswered(
  content: ProjectState['documents']['storyBible']['content'],
  prompt: StoryBiblePromptDef,
): boolean {
  return prompt.inputs.every(input => {
    const resolved = resolveStoryBiblePath(content, input.path)
    const emptyResolved = resolveStoryBiblePath(EMPTY_STORY_BIBLE_CONTENT, input.path)
    return resolved.defined
      && hasMeaningfulContent(resolved.value)
      && (!emptyResolved.defined || !sameValue(resolved.value, emptyResolved.value))
  })
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

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => sameValue(item, b[index]))
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>)
    const bObject = b as Record<string, unknown>
    const bKeys = Object.keys(bObject)
    if (aEntries.length !== bKeys.length) return false
    return aEntries.every(([key, value]) => Object.prototype.hasOwnProperty.call(bObject, key) && sameValue(value, bObject[key]))
  }

  return false
}
