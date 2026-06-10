import { describe, expect, it } from 'vitest'
import { runFidelityCheck } from '../../../server/compose/runFidelityCheck'
import { buildEntityInventory } from '../../../server/compose/entityInventory'
import { buildSynopsisFactSheet } from '../../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../../shared/compose/synopsisRecipe'
import { createEmptySynopsisContent, createEmptySeriesContent } from '../../../shared/documents'
import type { ComposedBlock } from '../../../shared/compose/types'

function seriesContentWithDynamicSections() {
  const content = createEmptySynopsisContent()
  content.logline.text = 'a heist crew wakes anew each week'
  content.series = createEmptySeriesContent()
  content.series.showOverview = 'a crew wakes with the last job erased'
  content.series.pilot = { logline: 'the first job goes wrong', prose: 'the floor gives way' }
  content.series.seasonOneArc = 'they learn who erased them'
  content.series.futureSeasons = [{ id: 's2', label: 'Season 2', summary: 'a bigger mark' }]
  content.series.characters = [{ id: 'c1', name: 'mara', role: 'lead', bio: 'a thief', arcPerSeason: ['trusts'] }]
  return content
}

const fs = () => buildSynopsisFactSheet(seriesContentWithDynamicSections(), 'series')
const recipe = getSynopsisRecipe('series')

describe('synopsis series fidelity — dynamic section coverage', () => {
  it('flags answered future-season and character fields the model omits', () => {
    const factSheet = fs()
    // Blocks cite the explicit sections but omit Where It Goes and Characters entirely.
    const blocks: ComposedBlock[] = [
      { type: 'heading', text: 'Logline' },
      { type: 'paragraph', text: 'the crew resets weekly', sourceFieldIds: ['logline.text', 'series.showOverview', 'series.pilot.logline', 'series.pilot.prose', 'series.seasonOneArc'] },
    ]
    const result = runFidelityCheck(blocks, factSheet, recipe, buildEntityInventory(factSheet))
    expect(result.status).toBe('flagged')
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'series.futureSeasons.s2.summary')).toBe(true)
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'series.characters.c1.name')).toBe(true)
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'series.characters.c1.arcPerSeason')).toBe(true)
  })

  it('passes clean when every answered dynamic field is cited', () => {
    const factSheet = fs()
    const allIds = factSheet.fields.map(f => f.id)
    const blocks: ComposedBlock[] = [
      { type: 'heading', text: 'Logline' },
      { type: 'paragraph', text: 'the crew resets weekly and learns the truth', sourceFieldIds: allIds },
    ]
    const result = runFidelityCheck(blocks, factSheet, recipe, buildEntityInventory(factSheet))
    expect(result.status).toBe('clean')
  })
})

describe('synopsis feature fidelity — hook coverage', () => {
  it('flags an answered logline.hook the model never cites', () => {
    const content = createEmptySynopsisContent()
    content.logline.text = 'a flood thriller'
    content.logline.protagonist = 'mara'
    content.logline.hook = 'the trail only surfaces at low tide'
    content.prose.opening = 'a quiet morning above the tideline'
    const factSheet = buildSynopsisFactSheet(content, 'feature')
    const featureRecipe = getSynopsisRecipe('feature')
    // Cite everything answered except the hook.
    const blocks: ComposedBlock[] = [
      { type: 'heading', text: 'Logline' },
      { type: 'logline', text: 'a flood thriller about mara', sourceFieldIds: ['logline.text', 'logline.protagonist'] },
      { type: 'paragraph', text: 'a quiet morning above the tideline', sourceFieldIds: ['prose.opening'] },
    ]
    const result = runFidelityCheck(blocks, factSheet, featureRecipe, buildEntityInventory(factSheet))
    expect(result.status).toBe('flagged')
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'logline.hook')).toBe(true)
  })
})
