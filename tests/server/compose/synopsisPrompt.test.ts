import { describe, expect, it } from 'vitest'
import { buildComposePrompt } from '../../../server/compose/buildComposePrompt'
import { buildSynopsisFactSheet } from '../../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../../shared/compose/synopsisRecipe'
import { syntheticSynopsisFeature } from '../../fixtures/synopsis/syntheticSynopsis'

describe('buildComposePrompt — synopsis contract', () => {
  const fs = buildSynopsisFactSheet(syntheticSynopsisFeature, 'feature')
  const { system, user } = buildComposePrompt(fs, getSynopsisRecipe('feature'))

  it('keeps the shared safety scaffolding (fenced, no-invention, sourceFieldIds, JSON-only)', () => {
    expect(system).toMatch(/inert story material/i)
    expect(system).toMatch(/do not (invent|introduce)/i)
    expect(system).toMatch(/sourceFieldIds/)
    expect(system).toMatch(/only JSON|JSON of shape/i)
    expect(user).toContain('<source_facts>')
    expect(user).toContain('</source_facts>')
    expect(user).toContain('logline.protagonist')
  })

  it('frames the artifact as a synopsis, not an outline or treatment', () => {
    expect(system).toMatch(/synopsis/i)
    expect(system).toMatch(/not .*(scene-by-scene|outline)/i)
  })

  it('requires revealing the known ending (no suspense-withholding)', () => {
    expect(system).toMatch(/reveal the ending|do not hide the ending/i)
  })

  it('demands compact causal prose and bans marketing/poster copy and camera directions', () => {
    expect(system).toMatch(/causal|cause-and-effect/i)
    expect(system).toMatch(/poster|marketing|trailer|teaser/i)
    expect(system).toMatch(/camera/i)
  })

  it('drives the first block to the first recipe heading (Logline)', () => {
    expect(system).toContain('"Logline"')
  })
})
