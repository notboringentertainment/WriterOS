import { describe, expect, it } from 'vitest'
import { getOutlineReadiness } from '../../../shared/compose/readiness'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { createEmptyOutlineContent } from '../../../shared/documents'
import { setOutlinePath } from '../../../client/src/lib/outlineDeck'

const recipe = getOutlineRecipe('feature')

function build(paths: Record<string, string>) {
  let c = createEmptyOutlineContent()
  for (const [path, value] of Object.entries(paths)) c = setOutlinePath(c, path, value)
  return buildOutlineFactSheet(c, 'feature')
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
