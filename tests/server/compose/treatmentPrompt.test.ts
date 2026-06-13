import { describe, expect, it } from 'vitest'
import { buildComposePrompt } from '../../../server/compose/buildComposePrompt'
import { buildTreatmentFactSheet } from '../../../shared/compose/treatmentFactSheet'
import { getTreatmentRecipe } from '../../../shared/compose/treatmentRecipe'
import { syntheticTreatment } from '../../fixtures/treatment/syntheticTreatment'

describe('buildComposePrompt — treatment contract', () => {
  const fs = buildTreatmentFactSheet(syntheticTreatment, 'feature')
  const { system, user } = buildComposePrompt(fs, getTreatmentRecipe('feature'))

  it('keeps the shared safety scaffolding (fenced, no-invention, sourceFieldIds, JSON-only)', () => {
    expect(system).toMatch(/inert story material/i)
    expect(system).toMatch(/do not (invent|introduce)/i)
    expect(system).toMatch(/sourceFieldIds/)
    expect(system).toMatch(/only JSON|JSON of shape/i)
    expect(user).toContain('<source_facts>')
    expect(user).toContain('</source_facts>')
    expect(user).toContain('prose.actThree')
    expect(user).toContain('mainCharacters.mara.name')
  })

  it('frames the artifact as a treatment, not an outline, synopsis, beat sheet, scriptment, or pitch', () => {
    expect(system).toMatch(/treatment/i)
    expect(system).toMatch(/beat sheet|beat outline/i)
    expect(system).toMatch(/scriptment/i)
    expect(system).toMatch(/pitch/i)
  })

  it('does not use the Oliver lens or the synopsis editor lens', () => {
    expect(system).not.toContain('Oliver')
    expect(system).not.toContain('synopsis editor')
    expect(system).not.toMatch(/scannable/i)
  })

  it('demands present-tense third-person cinematic prose telling the whole known story', () => {
    expect(system).toMatch(/present-tense/i)
    expect(system).toMatch(/third-person/i)
    expect(system).toMatch(/cinematic prose/i)
    expect(system).toMatch(/ending/i)
  })

  it('never supplies an ending the writer has not answered', () => {
    expect(system).toMatch(/never (fabricate|supply|invent) (a |the )?(resolution|ending)/i)
  })

  it('bans screenplay formatting including action-line prose, slug lines, and scene headings', () => {
    expect(system).toMatch(/screenplay/i)
    expect(system).toMatch(/slug lines?/i)
    expect(system).toMatch(/scene headings?/i)
    expect(system).toMatch(/action lines?/i)
    expect(system).toMatch(/camera/i)
  })

  it('bans resolving open questions and AI production notes in story prose', () => {
    expect(system).toMatch(/open questions/i)
    expect(system).toMatch(/production notes/i)
  })

  it('bans invented atmosphere and requires omitting sections with no source facts', () => {
    expect(system).toMatch(/sensory atmosphere|atmosphere/i)
    expect(system).toMatch(/no source facts, output no blocks|omit a section only if it has no source facts/i)
    expect(system).toMatch(/do not invent atmosphere/i)
  })

  it('bans assistant-to-user framing and metacommentary in composed blocks', () => {
    expect(system).toMatch(/based on what you have|your answers|you provided|this draft/i)
    expect(system).toMatch(/write the treatment itself/i)
  })

  it('drives the first block to the first recipe heading (Logline)', () => {
    expect(system).toContain('"Logline"')
  })
})
