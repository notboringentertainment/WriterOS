import { describe, expect, it } from 'vitest'
import { getOutlineReadiness } from '../../../shared/compose/readiness'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { createEmptyOutlineContent } from '../../../shared/documents'
import { createOutlineEpisode, setOutlinePath } from '../../../client/src/lib/outlineDeck'

const recipe = getOutlineRecipe('feature')

function build(paths: Record<string, string>) {
  let c = createEmptyOutlineContent()
  for (const [path, value] of Object.entries(paths)) c = setOutlinePath(c, path, value)
  return buildOutlineFactSheet(c, 'feature')
}

const seriesRecipe = getOutlineRecipe('series')

// setOutlinePath handles spine/seriesEngine/seasonArc (root.field); episodes are
// an array, so seed them via createOutlineEpisode directly.
function buildSeries(paths: Record<string, string>, episode?: Partial<Record<'hookLogline' | 'aStory' | 'bcStory' | 'changeByEnd' | 'endingHook', string>>) {
  let c = createEmptyOutlineContent()
  for (const [path, value] of Object.entries(paths)) c = setOutlinePath(c, path, value)
  if (episode) {
    c = { ...c, episodes: [{ ...createOutlineEpisode(1), ...episode }] }
  }
  return buildOutlineFactSheet(c, 'series')
}

describe('getOutlineReadiness (feature)', () => {
  it('sparse when core missing', () => {
    const r = getOutlineReadiness(build({ 'spine.protagonist': 'Mara' }), recipe)
    expect(r.tier).toBe('sparse')
    expect(r.missingCoreLabels.length).toBeGreaterThan(0)
  })
  it('partial when core present but not all important fields answered', () => {
    const r = getOutlineReadiness(build({
      'spine.protagonist': 'Mara',
      'spine.centralOpposition': 'The Syndicate',
      'units[id=feature.midpoint].whatHappens': 'Plan collapses.',
    }), recipe)
    expect(r.tier).toBe('partial')
  })
  it('rich when all important fields answered', () => {
    const r = getOutlineReadiness(build({
      'spine.protagonist': 'Mara',
      'spine.externalGoal': 'clear her name',
      'spine.internalNeed': 'trust again',
      'spine.centralOpposition': 'The Syndicate',
      'spine.coreStakes': 'her freedom',
      'units[id=feature.incitingIncident].whatHappens': 'A file surfaces.',
      'units[id=feature.midpoint].whatHappens': 'Plan collapses.',
      'units[id=feature.climax].whatHappens': 'She testifies.',
    }), recipe)
    expect(r.tier).toBe('rich')
  })
})

describe('getOutlineReadiness (series)', () => {
  // Series core gate = seriesEngine.repeatableConflict + seasonArc.seasonQuestion + >=1 episode.
  // (Design says "showPitch", but no card writes seriesEngine.showPitch; the Show pitch card
  //  writes repeatableConflict — product-approved 2026-06-06.)
  it('sparse when core missing (no repeatableConflict, no episode)', () => {
    const r = getOutlineReadiness(buildSeries({ 'seasonArc.seasonQuestion': 'Will the town survive?' }), seriesRecipe)
    expect(r.tier).toBe('sparse')
    expect(r.missingCoreLabels.length).toBeGreaterThan(0)
  })
  it('partial when core present but not all important fields answered', () => {
    const r = getOutlineReadiness(buildSeries({
      'seriesEngine.repeatableConflict': 'A new case each week',
      'seasonArc.seasonQuestion': 'Will the town survive?',
    }, { hookLogline: 'A body is found.' }), seriesRecipe)
    expect(r.tier).toBe('partial')
  })
  it('rich when all important fields answered and an episode exists', () => {
    const r = getOutlineReadiness(buildSeries({
      'spine.protagonist': 'Detective Reyes',
      'spine.externalGoal': 'close the case',
      'spine.internalNeed': 'forgive herself',
      'seasonArc.seasonQuestion': 'Will the town survive?',
      'seasonArc.seasonAntagonist': 'The Mayor',
      'spine.coreStakes': 'the town’s future',
      'seriesEngine.repeatableConflict': 'A new case each week',
      'seriesEngine.episodeEngine': 'case-of-the-week with a serial thread',
      'seriesEngine.pilotPromise': 'a town with a buried secret',
    }, { hookLogline: 'A body is found.' }), seriesRecipe)
    expect(r.tier).toBe('rich')
  })
})
