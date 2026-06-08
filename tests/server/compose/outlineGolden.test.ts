import { describe, expect, it, vi } from 'vitest'
import { composeOutline } from '../../../server/compose'
import { syntheticOutlineFeature } from '../../fixtures/outline/syntheticOutline'

// Distributed across sections so every answered important field id is cited:
// Who We Follow -> protagonist/externalGoal/internalNeed
// What Stands in the Way -> centralOpposition/coreStakes
// The Shape of the Story -> incitingIncident/midpoint/climax
const blocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Who We Follow' },
  { type: 'paragraph', text: 'Vera Solano, a disgraced forensic auditor, wants to clear her name and learn to trust again.', sourceFieldIds: ['spine.protagonist', 'spine.externalGoal', 'spine.internalNeed'] },
  { type: 'heading', text: 'What Stands in the Way' },
  { type: 'paragraph', text: 'The Meridian Group buried the evidence, and her freedom is on the line.', sourceFieldIds: ['spine.centralOpposition', 'spine.coreStakes'] },
  { type: 'heading', text: 'The Shape of the Story' },
  { type: 'leadInParagraph', lead: 'Disruption', text: 'She finds a deleted ledger entry.', sourceFieldIds: ['feature.incitingIncident.whatHappens'] },
  // Recipe lead with multi-word structural label + trailing punctuation: must
  // not be entity-diffed as a story fact.
  { type: 'leadInParagraph', lead: 'Point of No Return.', text: 'The audit becomes a hunt.', sourceFieldIds: ['feature.midpoint.whatHappens'] },
  { type: 'leadInParagraph', lead: 'Where It Lands', text: 'She confronts the board.', sourceFieldIds: ['feature.climax.whatHappens'] },
]})

describe('outline golden (synthetic)', () => {
  it('cites every answered important field so fidelity is clean with no warnings', async () => {
    const provider = { name: 'test', model: 'm', isConfigured: () => true, generateResponse: vi.fn(async () => blocks) }
    const result = await composeOutline({ content: syntheticOutlineFeature, format: 'feature', identity: { title: 'T', genre: 'Drama' }, provider: provider as never })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // All answered important fields covered, all entities/ids trace to source.
    expect(result.composed.fidelity.status).toBe('clean')
    expect(result.composed.fidelity.warnings).toEqual([])
    // Editorial sections present
    const headings = result.composed.blocks.filter(b => b.type === 'heading').map(b => (b as { text: string }).text)
    expect(headings).toEqual(expect.arrayContaining(['Who We Follow', 'What Stands in the Way', 'The Shape of the Story']))
  })
})
