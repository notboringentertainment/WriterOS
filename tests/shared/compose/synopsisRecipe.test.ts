import { describe, expect, it } from 'vitest'
import { getSynopsisRecipe, SYNOPSIS_RECIPE_VERSION } from '../../../shared/compose/synopsisRecipe'

describe('getSynopsisRecipe', () => {
  it('feature: protagonist core gate, logline lead + compact body, both required', () => {
    const r = getSynopsisRecipe('feature')
    expect(r.surface).toBe('synopsis')
    expect(r.format).toBe('feature')
    expect(r.recipeVersion).toBe(SYNOPSIS_RECIPE_VERSION)
    expect(r.coreRequiredFieldIds).toEqual(['logline.protagonist'])
    expect(r.sections.map(s => s.key)).toEqual(['logline', 'synopsisBody'])
    expect(r.sections.every(s => !s.omittable)).toBe(true)
    const body = r.sections.find(s => s.key === 'synopsisBody')!
    expect(body.importantFieldIds).toEqual([
      'prose.opening', 'prose.escalation', 'prose.middle', 'prose.climax', 'prose.resolution',
    ])
  })

  it('series: show-overview core gate, seven sections, optional tail sections omittable', () => {
    const r = getSynopsisRecipe('series')
    expect(r.format).toBe('series')
    expect(r.coreRequiredFieldIds).toEqual(['logline.text', 'series.showOverview'])
    expect(r.sections.map(s => s.key)).toEqual([
      'seriesLogline', 'showOverview', 'pilotSynopsis', 'seasonOneArc',
      'whereItGoes', 'characters', 'compsWhyNow',
    ])
    expect(r.sections.find(s => s.key === 'showOverview')?.omittable).toBe(false)
    expect(r.sections.find(s => s.key === 'pilotSynopsis')?.omittable).toBe(false)
    expect(r.sections.find(s => s.key === 'whereItGoes')?.omittable).toBe(true)
    expect(r.sections.find(s => s.key === 'characters')?.omittable).toBe(true)
    expect(r.sections.find(s => s.key === 'compsWhyNow')?.omittable).toBe(true)
  })
})
