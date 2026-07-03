import { describe, expect, it } from 'vitest'
import { buildSurfaceAwareness } from '../../client/src/lib/surfaceAwareness'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { setOutlinePath, FEATURE_DECK, SERIES_DECK } from '../../client/src/lib/outlineDeck'
import { FEATURE_SYNOPSIS_DECK } from '../../client/src/lib/synopsisDeck'
import { FEATURE_STORY_BIBLE_DECK } from '../../client/src/lib/storyBibleDeck'
import { TREATMENT_SURFACE_DECK } from '../../client/src/lib/treatmentDeck'
import type { ProjectState } from '../../client/src/lib/projectState'

function featureState(): ProjectState {
  const base = defaultProjectState()
  return { ...base, meta: { ...base.meta, format: 'feature' } }
}

function withOutline(state: ProjectState, path: string, value: string): ProjectState {
  return {
    ...state,
    documents: {
      ...state.documents,
      outline: {
        ...state.documents.outline,
        content: setOutlinePath(state.documents.outline.content, path, value),
      },
    },
  }
}

describe('buildSurfaceAwareness', () => {
  it('empty feature outline → next question is the first card, all unanswered', () => {
    const sa = buildSurfaceAwareness('outline', featureState())
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.surface).toBe('outline')
    expect(sa.surfaceTitle).toBe('Outline')
    expect(sa.format).toBe('feature')
    expect(sa.totalCount).toBe(FEATURE_DECK.length)
    expect(sa.answeredCount).toBe(0)
    expect(sa.selectionSource).toBe('first_unanswered')
    expect(sa.nextRecommendedAction).toBe('answer_next_question')
    expect(sa.nextQuestion).toMatchObject({
      id: 'spine.protagonist',
      label: 'Who are we following?',
      status: 'unanswered',
    })
    expect(sa.nextQuestion?.helper).toContain('person or group')
  })

  it('partially answered → next question is the first UNANSWERED card', () => {
    const state = withOutline(featureState(), 'spine.protagonist', 'Mara')
    const sa = buildSurfaceAwareness('outline', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.answeredCount).toBe(1)
    expect(sa.questions.find(q => q.id === 'spine.protagonist')?.status).toBe('answered')
    expect(sa.nextQuestion?.id).not.toBe('spine.protagonist')
    expect(sa.nextQuestion?.status).toBe('unanswered')
  })

  it('composite card stays unanswered until both bindings are filled', () => {
    let state = withOutline(featureState(), 'spine.protagonist', 'Mara')
    state = withOutline(state, 'spine.externalGoal', 'Escape')
    const sa = buildSurfaceAwareness('outline', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.questions.find(q => q.id === 'spine.wantNeed')?.status).toBe('unanswered')
  })

  it('all cards answered → nextRecommendedAction is all_answered', () => {
    let state = featureState()
    for (const card of FEATURE_DECK) {
      const paths = typeof card.mappingPath === 'string' ? [card.mappingPath] : card.mappingPath.map(b => b.path)
      for (const path of paths) state = withOutline(state, path, 'answered')
    }
    const sa = buildSurfaceAwareness('outline', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.answeredCount).toBe(FEATURE_DECK.length)
    expect(sa.nextRecommendedAction).toBe('all_answered')
    // nextQuestion falls back to the first card when nothing is unanswered.
    expect(sa.nextQuestion?.id).toBe(FEATURE_DECK[0].id)
  })

  it('series outline uses the series question deck', () => {
    const base = defaultProjectState()
    const state = { ...base, meta: { ...base.meta, format: 'series' as const } }
    const sa = buildSurfaceAwareness('outline', state)
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.format).toBe('series')
    expect(sa.totalCount).toBe(SERIES_DECK.length)
    expect(sa.nextQuestion?.label).toBe('Who are we following?')
  })

  it('feature synopsis sends its live question deck', () => {
    const sa = buildSurfaceAwareness('synopsis', featureState())
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.surface).toBe('synopsis')
    expect(sa.surfaceTitle).toBe('Synopsis')
    expect(sa.totalCount).toBe(FEATURE_SYNOPSIS_DECK.length)
    expect(sa.nextQuestion?.label).toBe('What should appear as the title?')
  })

  it('treatment sends its live question deck', () => {
    const sa = buildSurfaceAwareness('treatment', featureState())
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.surface).toBe('treatment')
    expect(sa.surfaceTitle).toBe('Treatment')
    expect(sa.totalCount).toBe(TREATMENT_SURFACE_DECK.length)
    expect(sa.nextQuestion?.label).toBe('What is the story in one sentence?')
  })

  it('story bible sends its live question deck', () => {
    const sa = buildSurfaceAwareness('story-bible', featureState())
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.surface).toBe('story-bible')
    expect(sa.surfaceTitle).toBe('Story Bible')
    expect(sa.totalCount).toBe(FEATURE_STORY_BIBLE_DECK.length)
    expect(sa.answeredCount).toBe(0)
    expect(sa.nextQuestion?.label).toBe('What should appear as the title?')
    expect(sa.questions.find(q => q.id === 'feature-status')?.status).toBe('unanswered')
  })

  it('story bible does count a non-default status selection as answered', () => {
    const state = featureState()
    state.documents.storyBible.content.cover.status = 'pitch'
    const sa = buildSurfaceAwareness('story-bible', state)
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.answeredCount).toBe(1)
    expect(sa.questions.find(q => q.id === 'feature-status')?.status).toBe('answered')
  })

  it('script tab stays outside intake surface awareness', () => {
    expect(buildSurfaceAwareness('script', featureState())).toEqual({ kind: 'none' })
  })
})
