import { describe, expect, it } from 'vitest'
import { runFidelityCheck } from '../../../server/compose/runFidelityCheck'
import { buildEntityInventory } from '../../../server/compose/entityInventory'
import { buildTreatmentFactSheet } from '../../../shared/compose/treatmentFactSheet'
import { getTreatmentRecipe } from '../../../shared/compose/treatmentRecipe'
import { createEmptyTreatmentContent } from '../../../shared/documents'
import type { ComposedBlock } from '../../../shared/compose/types'

function contentWithCharacterAndPassage() {
  const content = createEmptyTreatmentContent()
  content.logline = 'a drowned city refuses to die'
  content.prose.opening = 'a dive at dawn'
  content.prose.actOne = 'the police call it an accident'
  content.mainCharacters = [{
    id: 'c1', name: 'mara', role: 'diver', externalWant: 'recover the body',
    internalNeed: '', flawOrWound: '', secretOrContradiction: '', arc: '', relationshipPressure: '',
  }]
  content.prose.customSections = [{ id: 'p1', heading: 'The Bell', body: 'the bell tolls underwater' }]
  return content
}

const recipe = getTreatmentRecipe('feature')

describe('treatment fidelity — dynamic-id citation coverage', () => {
  it('flags an answered character and custom passage no block cites', () => {
    const factSheet = buildTreatmentFactSheet(contentWithCharacterAndPassage(), 'feature')
    const blocks: ComposedBlock[] = [
      { type: 'heading', text: 'Logline' },
      { type: 'logline', text: 'a drowned city refuses to die', sourceFieldIds: ['logline'] },
      { type: 'paragraph', text: 'a dive at dawn; the police call it an accident', sourceFieldIds: ['prose.opening', 'prose.actOne'] },
    ]
    const result = runFidelityCheck(blocks, factSheet, recipe, buildEntityInventory(factSheet))
    expect(result.status).toBe('flagged')
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'mainCharacters.c1.name')).toBe(true)
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'mainCharacters.c1.role')).toBe(true)
    expect(result.warnings.some(w => w.kind === 'coverage' && w.fieldId === 'prose.customSections.p1.body')).toBe(true)
  })

  it('passes clean when every answered field is cited', () => {
    const factSheet = buildTreatmentFactSheet(contentWithCharacterAndPassage(), 'feature')
    const allIds = factSheet.fields.map(f => f.id)
    const blocks: ComposedBlock[] = [
      { type: 'heading', text: 'Logline' },
      { type: 'paragraph', text: 'a drowned city, a diver named mara, a bell that tolls underwater', sourceFieldIds: allIds },
    ]
    const result = runFidelityCheck(blocks, factSheet, recipe, buildEntityInventory(factSheet))
    expect(result.status).toBe('clean')
  })
})
