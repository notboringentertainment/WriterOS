import { describe, expect, it, vi } from 'vitest'
import { composeTreatment } from '../../../server/compose'
import { syntheticTreatment } from '../../fixtures/treatment/syntheticTreatment'

// Distributed across the five recipe sections so every answered important field id is
// cited and fidelity comes back clean with zero warnings.
const blocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Logline' },
  { type: 'logline', text: 'Mara Voss dives her drowned city and surfaces with proof the flood was murder.', sourceFieldIds: ['logline', 'concept.premise'] },
  { type: 'heading', text: 'Concept' },
  { type: 'paragraph', text: 'Mara maps the ruins in cold, patient dread; what the city buried comes back as weather.', sourceFieldIds: ['concept.premise', 'concept.tone', 'concept.theme', 'concept.emotionalPromise'] },
  { type: 'heading', text: 'Main Characters' },
  { type: 'paragraph', text: 'Mara Voss dives alone for her brother, carrying the survey she sold and the blame she keeps.', sourceFieldIds: ['mainCharacters.mara.name', 'mainCharacters.mara.role', 'mainCharacters.mara.externalWant', 'mainCharacters.mara.internalNeed', 'mainCharacters.mara.flawOrWound', 'mainCharacters.mara.secretOrContradiction', 'mainCharacters.mara.arc', 'mainCharacters.mara.relationshipPressure'] },
  { type: 'paragraph', text: 'Oren Halle wants the city kept under water and the salvage rights his.', sourceFieldIds: ['mainCharacters.oren.name', 'mainCharacters.oren.role', 'mainCharacters.oren.externalWant'] },
  { type: 'heading', text: 'The Story' },
  { type: 'paragraph', text: 'Mara finds the engineer zip-tied to the bell cage and traces the ties to the water authority.', sourceFieldIds: ['prose.opening', 'prose.actOne'] },
  { type: 'paragraph', text: 'Mara survives a cut air line as the bell tolls underwater for the first time since the flood.', sourceFieldIds: ['prose.actTwo', 'prose.customSections.bellscene.body'] },
  { type: 'paragraph', text: 'Mara floods the archive on her own timer, takes the recorded admission, and the city begins to drain.', sourceFieldIds: ['prose.actThree'] },
  { type: 'heading', text: 'Visual and Tonal Language' },
  { type: 'paragraph', text: 'Rooftops stand as islands above streetlights still burning on the old grid, scored by hydrophone hum and regulator breath.', sourceFieldIds: ['visualAndTonal.overallTone', 'visualAndTonal.visualWorld', 'visualAndTonal.recurringImagesOrMotifs', 'visualAndTonal.musicOrSoundFeeling', 'visualAndTonal.pacing', 'visualAndTonal.genreRules', 'visualAndTonal.compsAndReferences'] },
]})

// The contract bans assistant-to-user framing; the composed body must never carry it.
const FORBIDDEN_METACOMMENTARY = [
  'Based on what', 'your answers', 'you provided', 'this draft will', 'this treatment will',
]

describe('treatment golden (synthetic)', () => {
  it('cites every answered important field so fidelity is clean with no warnings', async () => {
    const provider = { name: 'test', model: 'm', isConfigured: () => true, generateResponse: vi.fn(async () => blocks) }
    const result = await composeTreatment({ content: syntheticTreatment, format: 'feature', identity: { title: 'Tidewrack', genre: 'Thriller' }, provider: provider as never })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.composed.fidelity.status).toBe('clean')
    expect(result.composed.fidelity.warnings).toEqual([])

    const headings = result.composed.blocks.filter(b => b.type === 'heading').map(b => (b as { text: string }).text)
    expect(headings).toEqual(['Logline', 'Concept', 'Main Characters', 'The Story', 'Visual and Tonal Language'])

    const prose = result.composed.blocks
      .map(b => ('text' in b ? b.text : ''))
      .join('\n')
    for (const phrase of FORBIDDEN_METACOMMENTARY) {
      expect(prose.toLowerCase()).not.toContain(phrase.toLowerCase())
    }
  })
})
