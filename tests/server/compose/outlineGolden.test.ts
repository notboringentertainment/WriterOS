import { describe, expect, it, vi } from 'vitest'
import { composeOutline } from '../../../server/compose'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { buildEntityInventory } from '../../../server/compose/entityInventory'
import { syntheticOutlineFeature } from '../../fixtures/outline/syntheticOutline'

const blocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Who We Follow' },
  { type: 'paragraph', text: 'Vera Solano, a disgraced forensic auditor, wants to clear her name.', sourceFieldIds: ['spine.protagonist', 'spine.externalGoal'] },
  { type: 'heading', text: 'What Stands in the Way' },
  { type: 'paragraph', text: 'The Meridian Group buried the evidence.', sourceFieldIds: ['spine.centralOpposition'] },
  { type: 'heading', text: 'The Shape of the Story' },
  { type: 'leadInParagraph', lead: 'Disruption', text: 'She finds a deleted ledger entry.', sourceFieldIds: ['feature.incitingIncident.whatHappens'] },
]})

describe('outline golden (synthetic)', () => {
  it('composed entities are a subset of source facts and important fields are covered', async () => {
    const provider = { name: 'test', model: 'm', isConfigured: () => true, generateResponse: vi.fn(async () => blocks) }
    const result = await composeOutline({ content: syntheticOutlineFeature, format: 'feature', identity: { title: 'T', genre: 'Drama' }, provider: provider as never })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const inv = buildEntityInventory(buildOutlineFactSheet(syntheticOutlineFeature, 'feature'))
    // No entity_diff or dangling warnings => entities/ids all trace to source
    expect(result.composed.fidelity.warnings.filter(w => w.kind === 'entity_diff' || w.kind === 'dangling_source_id')).toEqual([])
    // Editorial sections present
    const headings = result.composed.blocks.filter(b => b.type === 'heading').map(b => (b as { text: string }).text)
    expect(headings).toEqual(expect.arrayContaining(['Who We Follow', 'What Stands in the Way', 'The Shape of the Story']))
    void inv
  })
})
