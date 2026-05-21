import { describe, expect, it } from 'vitest'
import { createEmptyOutlineContent } from '../../shared/documents'
import {
  FEATURE_DECK,
  SERIES_DECK,
  resolveOutlinePath,
  seedEpisodes101To103,
  setOutlinePath,
} from '../../client/src/lib/outlineDeck'

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
      createEmptyOutlineContent(),
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

  it('expresses the series engine card as labeled composite bindings', () => {
    const card = SERIES_DECK.find(item => item.id === 'series.showPitch')
    expect(card).toBeDefined()
    expect(card?.mappingPath).toEqual([
      { label: 'Repeatable pressure', path: 'seriesEngine.repeatableConflict' },
      { label: 'Typical episode shape', path: 'seriesEngine.episodeEngine' },
      { label: 'Long question', path: 'seriesEngine.serialQuestion' },
    ])
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
