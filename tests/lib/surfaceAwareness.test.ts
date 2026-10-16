import { describe, expect, it } from 'vitest'
import { buildSurfaceAwareness } from '../../client/src/lib/surfaceAwareness'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createOutlineUnit, getOutlineDeck, setOutlinePath, FEATURE_DECK, SERIES_DECK } from '../../client/src/lib/outlineDeck'
import { FEATURE_ROLES, resolveFeatureRoleUnitIds } from '../../shared/featureRoleBindings'
import { STORY_BIBLE_SECTIONS } from '../../client/src/lib/storyBibleSections'
import type { ProjectState } from '../../client/src/lib/projectState'

function featureState(): ProjectState {
  const base = defaultProjectState()
  return {
    ...base,
    meta: { ...base.meta, format: 'feature' },
    documents: {
      ...base.documents,
      outline: {
        ...base.documents.outline,
        content: {
          ...base.documents.outline.content,
          units: FEATURE_ROLES.map(role => createOutlineUnit(`feature.${role}`)),
        },
      },
    },
  }
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
    expect(sa.surfaceTitle).toBe('Beat Sheet')
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
    expect(sa.questions.find(q => q.id === 'spine.protagonist')).toMatchObject({
      status: 'answered',
      answers: [{ value: 'Mara' }],
    })
    expect(sa.nextQuestion?.id).not.toBe('spine.protagonist')
    expect(sa.nextQuestion?.status).toBe('unanswered')
  })

  it('composite outline questions expose each current answer with its field label', () => {
    let state = withOutline(featureState(), 'spine.externalGoal', 'Steal the ledger')
    state = withOutline(state, 'spine.internalNeed', 'Trust his family')
    const sa = buildSurfaceAwareness('outline', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.questions.find(q => q.id === 'spine.wantNeed')?.answers).toEqual([
      { label: 'What they want', value: 'Steal the ledger' },
      { label: 'What they need', value: 'Trust his family' },
    ])
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
    const resolution = resolveFeatureRoleUnitIds(state.documents.outline.content)
    for (const card of getOutlineDeck('feature', resolution)) {
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

  it('Pages have no question decks', () => {
    expect(buildSurfaceAwareness('synopsis', featureState())).toEqual({ kind: 'none' })
    expect(buildSurfaceAwareness('treatment', featureState())).toEqual({ kind: 'none' })
  })

  it('story bible sends its sections, written or not', () => {
    const state = featureState()
    state.documents.storyBible.content.cover.title = 'Sample Project'
    const sa = buildSurfaceAwareness('story-bible', state)
    expect(sa.kind).toBe('intake')
    if (sa.kind !== 'intake') return
    expect(sa.surface).toBe('story-bible')
    expect(sa.surfaceTitle).toBe('Story Bible')
    expect(sa.totalCount).toBe(STORY_BIBLE_SECTIONS.length)
    expect(sa.answeredCount).toBe(1)
    expect(sa.questions[0]).toMatchObject({
      label: 'The story',
      status: 'answered',
      answers: [{ label: 'Title', value: 'Sample Project' }],
    })
    expect(sa.questions.find(q => q.id === 'story-bible-world')?.status).toBe('unanswered')
  })

  it('story bible counts named people as written', () => {
    const state = featureState()
    state.documents.storyBible.content.characters = [{
      id: 'c1', name: 'Ivy', role: '', want: '', need: '', flaw: '', secret: '', contradiction: '', arc: '',
      relationshipPressure: '', behavioralAnchors: '', speechPatterns: '', neverWriteThemAs: '', continuityFacts: '',
    }]
    const sa = buildSurfaceAwareness('story-bible', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.questions.find(q => q.id === 'story-bible-people')).toMatchObject({
      status: 'answered', answers: [{ label: 'Ivy', value: 'character' }],
    })
  })

  it('script tab stays outside intake surface awareness', () => {
    expect(buildSurfaceAwareness('script', featureState())).toEqual({ kind: 'none' })
  })
})
