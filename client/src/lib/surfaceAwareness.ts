import { normalizeProjectFormat } from '@shared/projectFormat'
import type { SurfaceAwareness, SurfaceQuestion } from '@shared/surfaceAwareness'
import type { ProjectState } from './projectState'
import type { ActiveTab } from './wpRouting'
import { getOutlineDeck, isOutlineCardAnswered } from './outlineDeck'
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

export function buildSurfaceAwareness(activeTab: ActiveTab, state: ProjectState): SurfaceAwareness {
  const format = normalizeProjectFormat(state.meta.format)

  switch (activeTab) {
    case 'outline': {
      const content = state.documents.outline.content
      const questions: SurfaceQuestion[] = getOutlineDeck(format).map(card => ({
        id: card.id,
        label: card.question,
        helper: card.helper,
        status: isOutlineCardAnswered(content, card) ? 'answered' : 'unanswered',
      }))
      return buildIntakeSurface('outline', 'Outline', format, questions)
    }

    case 'synopsis': {
      const content = state.documents.synopsis.content
      const questions: SurfaceQuestion[] = getSynopsisDeck(format).map(prompt => ({
        id: prompt.id,
        label: prompt.question,
        helper: prompt.helper,
        status: isSynopsisPromptAnswered(content, prompt) ? 'answered' : 'unanswered',
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
    return resolved.defined && hasMeaningfulContent(resolved.value)
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
