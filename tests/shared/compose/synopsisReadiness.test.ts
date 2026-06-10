import { describe, expect, it } from 'vitest'
import { buildSynopsisFactSheet } from '../../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../../shared/compose/synopsisRecipe'
import { getSynopsisReadiness } from '../../../shared/compose/synopsisReadiness'
import { createEmptySynopsisContent, createEmptySeriesContent } from '../../../shared/documents'

function featureReadiness(mutate: (c: ReturnType<typeof createEmptySynopsisContent>) => void) {
  const content = createEmptySynopsisContent()
  mutate(content)
  return getSynopsisReadiness(buildSynopsisFactSheet(content, 'feature'), getSynopsisRecipe('feature'))
}

function seriesReadiness(mutate: (s: ReturnType<typeof createEmptySeriesContent>) => void) {
  const content = createEmptySynopsisContent()
  content.series = createEmptySeriesContent()
  mutate(content.series)
  return getSynopsisReadiness(buildSynopsisFactSheet(content, 'series'), getSynopsisRecipe('series'))
}

describe('getSynopsisReadiness — feature', () => {
  it('sparse when no protagonist', () => {
    const r = featureReadiness(c => { c.prose.opening = 'A morning.' })
    expect(r.tier).toBe('sparse')
    expect(r.missingCoreLabels.length).toBeGreaterThan(0)
  })

  it('sparse when protagonist present but zero prose movements', () => {
    const r = featureReadiness(c => { c.logline.protagonist = 'Mara' })
    expect(r.tier).toBe('sparse')
  })

  it('partial when protagonist + a movement but the ending is missing', () => {
    const r = featureReadiness(c => {
      c.logline.protagonist = 'Mara'
      c.logline.obstacle = 'The tide'
      c.logline.stakes = 'Her sister drowns'
      c.prose.opening = 'A morning.'
      // prose.resolution left empty
    })
    expect(r.tier).toBe('partial')
  })

  it('rich when protagonist, all five movements, and goal/obstacle/stakes present', () => {
    const r = featureReadiness(c => {
      c.logline.protagonist = 'Mara'
      c.logline.goal = 'Reach the spire'
      c.logline.obstacle = 'The tide'
      c.logline.stakes = 'Her sister drowns'
      c.prose.opening = 'A morning.'
      c.prose.escalation = 'The water rises.'
      c.prose.middle = 'She finds the boat.'
      c.prose.climax = 'The spire floods.'
      c.prose.resolution = 'She lets go.'
    })
    expect(r.tier).toBe('rich')
  })
})

describe('getSynopsisReadiness — series', () => {
  it('sparse when no show overview', () => {
    const r = seriesReadiness(s => { s.pilot.logline = 'The first job.' })
    expect(r.tier).toBe('sparse')
  })

  it('partial when show overview present but pilot/season thin, with omitted tail sections', () => {
    const r = seriesReadiness(s => {
      s.showOverview = 'A crew resets each week.'
      s.pilot.logline = 'The first job.'
      // pilot.prose, seasonOneArc empty; no futureSeasons/characters/comps
    })
    expect(r.tier).toBe('partial')
    expect(r.omittedSectionHeadings).toContain('Where It Goes')
    expect(r.omittedSectionHeadings).toContain('Characters')
  })

  it('rich when overview, pilot, season arc, and all tail sections are present', () => {
    const r = seriesReadiness(s => {
      s.showOverview = 'A crew resets each week.'
      s.pilot.logline = 'The first job.'
      s.pilot.prose = 'They breach the vault.'
      s.seasonOneArc = 'They learn who erased them.'
      s.futureSeasons = [{ id: 's2', label: 'Season 2', summary: 'A bigger mark.' }]
      s.characters = [{ id: 'c1', name: 'Mara', role: 'Lead', bio: 'A thief.', arcPerSeason: ['Trusts'] }]
      s.compsAndWhyThisShowNow = 'Heat meets Memento, now.'
    })
    expect(r.tier).toBe('rich')
    expect(r.omittedSectionHeadings).toEqual([])
  })
})
