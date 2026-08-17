import { normalizeProjectFormat } from '@shared/projectFormat'
import type { SurfaceAnswer, SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import { createEmptyStoryBibleContent } from '@shared/documents'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { getOutlineDeck, isOutlineCardAnswered, resolveOutlinePath } from './outlineDeck'
import {
  getDeckForFormat as getSynopsisDeck,
  resolveSynopsisPath,
  type SynopsisPromptDef,
} from './synopsisDeck'
import {
  getDeckForFormat as getStoryBibleDeck,
  resolveStoryBiblePath,
  type StoryBiblePromptDef,
} from './storyBibleDeck'
import { TREATMENT_SURFACE_DECK, resolveTreatmentPath, type TreatmentPromptDef } from './treatmentDeck'

const EMPTY_STORY_BIBLE_CONTENT = createEmptyStoryBibleContent()

export function buildSurfaceAwareness(activeTab: ActiveTab, state: ProjectState): SurfaceAwareness {
  const format = normalizeProjectFormat(state.meta.format)

  switch (activeTab) {
    case 'outline': {
      const content = state.documents.outline.content
      const questions: SurfaceQuestion[] = getOutlineDeck(format).map(card => {
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
      return buildIntakeSurface('outline', 'Outline', format, questions)
    }

    case 'synopsis': {
      const content = state.documents.synopsis.content
      const questions: SurfaceQuestion[] = getSynopsisDeck(format).map(prompt => ({
        id: prompt.id,
        label: prompt.question,
        helper: prompt.helper,
        status: isSynopsisPromptAnswered(content, prompt) ? 'answered' : 'unanswered',
        answers: collectSurfaceAnswers(prompt.inputs.map(input => ({
          label: input.label,
          value: resolveSynopsisPath(content, input.path).value,
        }))),
      }))
      return buildIntakeSurface('synopsis', 'Synopsis', format, questions)
    }

    case 'treatment': {
      const content = state.documents.treatment.content
      const questions: SurfaceQuestion[] = TREATMENT_SURFACE_DECK.map(prompt => ({
        id: prompt.id,
        label: prompt.question,
        helper: prompt.helper,
        status: isTreatmentPromptAnswered(content, prompt) ? 'answered' : 'unanswered',
        answers: collectSurfaceAnswers(prompt.paths.map(path => ({
          label: prompt.paths.length > 1 ? path : undefined,
          value: resolveTreatmentPath(content, path).value,
        }))),
      }))
      return buildIntakeSurface('treatment', 'Treatment', format, questions)
    }

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

function isSynopsisPromptAnswered(
  content: ProjectState['documents']['synopsis']['content'],
  prompt: SynopsisPromptDef,
): boolean {
  return prompt.inputs.every(input => {
    const resolved = resolveSynopsisPath(content, input.path)
    return resolved.defined && hasMeaningfulContent(resolved.value)
  })
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

function isTreatmentPromptAnswered(
  content: ProjectState['documents']['treatment']['content'],
  prompt: TreatmentPromptDef,
): boolean {
  return prompt.paths.every(path => {
    const resolved = resolveTreatmentPath(content, path)
    return resolved.defined && hasMeaningfulContent(resolved.value)
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
