import { describe, expect, it } from 'vitest'
import { createEmptyOutlineContent } from '../../shared/documents'
import {
  FEATURE_DECK,
  SERIES_DECK,
  createOutlineUnit,
  getOutlineCardBindings,
  getOutlineDeck,
  isOutlineCardAnswered,
  resolveOutlinePath,
  seedEpisodes101To103,
  setOutlinePath,
} from '../../client/src/lib/outlineDeck'
import { resolveFeatureRoleUnitIds } from '../../shared/featureRoleBindings'

describe('outlineDeck', () => {
  it('defines the locked V1 card counts', () => {
    expect(FEATURE_DECK).toHaveLength(11)
    expect(SERIES_DECK).toHaveLength(10)
  })

  it('keeps structural labels out of card questions', () => {
    const hiddenTerms = ['Inciting incident', 'Midpoint', 'All-is-lost', 'Season climax']
    const questions = [...FEATURE_DECK, ...SERIES_DECK].map(card => card.question)

    for (const term of hiddenTerms) {
      expect(questions.some(question => question.includes(term))).toBe(false)
    }
  })

  it('writes feature act cards into stable OutlineUnit paths', () => {
    const content = setOutlinePath(
      { ...createEmptyOutlineContent(), units: [createOutlineUnit('feature.midpoint')] },
      'units[id=feature.midpoint].whatHappens',
      'She realizes she has been chasing the wrong person.',
    )

    expect(resolveOutlinePath(content, 'units[id=feature.midpoint].whatHappens')).toBe(
      'She realizes she has been chasing the wrong person.',
    )
    expect(content.units[0]).toMatchObject({
      id: 'feature.midpoint',
      title: 'Midpoint',
      actOrSequence: 'Act II',
    })
  })

  it('lets the first card edit initialize an empty feature outline', () => {
    const blank = createEmptyOutlineContent()
    const deck = getOutlineDeck('feature', resolveFeatureRoleUnitIds(blank))
    const opening = deck.find(card => card.id === 'feature.openingNormalWorld')!
    const path = getOutlineCardBindings(opening)[0].path

    expect(path).toBe('units[id=feature.openingNormalWorld].whatHappens')
    const edited = setOutlinePath(blank, path, 'A quiet morning.')
    expect(edited.units).toHaveLength(8)
    expect(edited.units.find(unit => unit.id === 'feature.openingNormalWorld')?.whatHappens).toBe('A quiet morning.')
  })

  it('lets a partial stock outline fill a missing card without adding the other stock units', () => {
    const partial = {
      ...createEmptyOutlineContent(),
      units: [{ ...createOutlineUnit('feature.openingNormalWorld'), whatHappens: 'A quiet morning.' }],
    }
    const deck = getOutlineDeck('feature', resolveFeatureRoleUnitIds(partial))
    const inciting = deck.find(card => card.id === 'feature.incitingIncident')!
    const path = getOutlineCardBindings(inciting)[0].path

    expect(path).toBe('units[id=feature.incitingIncident].whatHappens')
    const edited = setOutlinePath(partial, path, 'A letter arrives.')
    expect(edited.units.map(unit => unit.id)).toEqual([
      'feature.openingNormalWorld', 'feature.incitingIncident',
    ])
    expect(edited.units[1].whatHappens).toBe('A letter arrives.')
  })

  it('does not create a stock unit when any custom unit is present', () => {
    const mixed = {
      ...createEmptyOutlineContent(),
      units: [createOutlineUnit('feature.openingNormalWorld'), createOutlineUnit('custom.beat02')],
    }
    const deck = getOutlineDeck('feature', resolveFeatureRoleUnitIds(mixed))
    const inciting = deck.find(card => card.id === 'feature.incitingIncident')!

    expect(getOutlineCardBindings(inciting)[0].path).toBe('')
    expect(setOutlinePath(mixed, 'units[id=feature.incitingIncident].whatHappens', 'Do not insert')).toBe(mixed)
  })

  it('binds feature cards to explicitly mapped unit IDs', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: [createOutlineUnit('feature.beat08')],
      featureRoleUnitIds: { midpoint: 'feature.beat08', climax: 'feature.beat08' },
    }
    const deck = getOutlineDeck('feature', resolveFeatureRoleUnitIds(content))
    const midpoint = deck.find(card => card.id === 'feature.midpoint')!
    const climax = deck.find(card => card.id === 'feature.climax')!
    expect(getOutlineCardBindings(midpoint)[0].path).toBe('units[id=feature.beat08].whatHappens')
    expect(getOutlineCardBindings(climax)[0].path).toBe('units[id=feature.beat08].whatHappens')
    const edited = setOutlinePath(content, getOutlineCardBindings(midpoint)[1].path, 'A consequence')
    const editedAgain = setOutlinePath(edited, getOutlineCardBindings(climax)[0].path, 'A final move')
    expect(editedAgain.units).toHaveLength(1)
    expect(editedAgain.units[0]).toMatchObject({ consequence: 'A consequence', whatHappens: 'A final move' })
  })

  it('leaves missing roles unbound and never creates a unit during a card edit', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: Array.from({ length: 15 }, (_, index) => ({
        ...createOutlineUnit(`feature.beat${String(index + 1).padStart(2, '0')}`),
        number: index + 1,
      })),
    }
    const deck = getOutlineDeck('feature', resolveFeatureRoleUnitIds(content))
    const paths = deck.filter(card => card.section !== 'spine').flatMap(getOutlineCardBindings).map(binding => binding.path)
    expect(paths).toEqual(Array(12).fill(''))
    let edited = content
    for (const path of paths) edited = setOutlinePath(edited, path, 'do not write')
    edited = setOutlinePath(edited, 'units[id=feature.midpoint].whatHappens', 'do not create')
    expect(edited.units).toHaveLength(15)
    expect(new Set(edited.units.map(unit => unit.number)).size).toBe(15)
  })

  it('expresses the series engine card as labeled composite bindings', () => {
    const card = SERIES_DECK.find(item => item.id === 'series.showPitch')
    expect(card).toBeDefined()
    expect(card?.mappingPath).toEqual([
      { label: 'Repeatable pressure', path: 'seriesEngine.repeatableConflict' },
      { label: 'Typical episode shape', path: 'seriesEngine.episodeEngine' },
      { label: 'Long question', path: 'seriesEngine.serialQuestion' },
    ])
  })

  it('normalizes a single-string mappingPath into one binding via getOutlineCardBindings', () => {
    const protagonist = FEATURE_DECK.find(card => card.id === 'spine.protagonist')!
    expect(getOutlineCardBindings(protagonist)).toEqual([
      { label: protagonist.question, path: 'spine.protagonist' },
    ])
  })

  it('returns the explicit binding list for a composite card', () => {
    const wantNeed = FEATURE_DECK.find(card => card.id === 'spine.wantNeed')!
    expect(getOutlineCardBindings(wantNeed)).toEqual([
      { label: 'What they want', path: 'spine.externalGoal' },
      { label: 'What they need', path: 'spine.internalNeed' },
    ])
  })

  it('marks a single-binding card answered only when its field has text', () => {
    const protagonist = FEATURE_DECK.find(card => card.id === 'spine.protagonist')!
    const empty = createEmptyOutlineContent()
    expect(isOutlineCardAnswered(empty, protagonist)).toBe(false)
    const filled = setOutlinePath(empty, 'spine.protagonist', 'Mara')
    expect(isOutlineCardAnswered(filled, protagonist)).toBe(true)
  })

  it('marks a composite card answered only when EVERY binding has text', () => {
    const wantNeed = FEATURE_DECK.find(card => card.id === 'spine.wantNeed')!
    let content = createEmptyOutlineContent()
    expect(isOutlineCardAnswered(content, wantNeed)).toBe(false)
    content = setOutlinePath(content, 'spine.externalGoal', 'Escape the city')
    expect(isOutlineCardAnswered(content, wantNeed)).toBe(false) // only one binding filled
    content = setOutlinePath(content, 'spine.internalNeed', 'Learn to trust')
    expect(isOutlineCardAnswered(content, wantNeed)).toBe(true)
  })

  it('treats whitespace-only answers as unanswered', () => {
    const protagonist = FEATURE_DECK.find(card => card.id === 'spine.protagonist')!
    const content = setOutlinePath(createEmptyOutlineContent(), 'spine.protagonist', '   ')
    expect(isOutlineCardAnswered(content, protagonist)).toBe(false)
  })

  it('seeds the starter series episode map without overwriting existing episodes', () => {
    const seeded = seedEpisodes101To103(createEmptyOutlineContent())
    expect(seeded.episodes.map(episode => episode.label)).toEqual([
      'Episode 101',
      'Episode 102',
      'Episode 103',
    ])

    const reseeded = seedEpisodes101To103(seeded)
    expect(reseeded).toBe(seeded)
  })
})
