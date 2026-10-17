import { describe, expect, it } from 'vitest'
import { buildSurfaceAwareness } from '../../client/src/lib/surfaceAwareness'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { FEATURE_ROLES } from '../../shared/featureRoleBindings'
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

describe('buildSurfaceAwareness', () => {
  it('an unlinked Beat Sheet offers no questions: beats come from Story-drive only', () => {
    expect(buildSurfaceAwareness('outline', featureState())).toEqual({ kind: 'none' })
  })

  it('a linked Beat Sheet lists Story-drive beats, next is the first beat without text', () => {
    const state = featureState()
    state.documents.outline.content = {
      ...state.documents.outline.content,
      units: [
        { ...createOutlineUnit('b2'), number: 2, title: 'The call', whatHappens: '' },
        { ...createOutlineUnit('b1'), number: 1, title: 'Opening', whatHappens: 'Ace cleans a scene.' },
      ],
      beatSheetSource: { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-10-16T00:00:00.000Z', beatCount: 2, label: null },
    }
    const sa = buildSurfaceAwareness('outline', state)
    if (sa.kind !== 'intake') throw new Error('expected intake')
    expect(sa.questions.map(q => q.label)).toEqual(['1. Opening', '2. The call'])
    expect(sa.questions[0]).toMatchObject({ status: 'answered', answers: [{ value: 'Ace cleans a scene.' }] })
    expect(sa.nextQuestion?.label).toBe('2. The call')
    expect(sa.questions.some(q => q.label === 'Who are we following?')).toBe(false)
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
