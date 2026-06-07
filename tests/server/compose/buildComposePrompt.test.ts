import { describe, expect, it } from 'vitest'
import { buildComposePrompt } from '../../../server/compose/buildComposePrompt'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { syntheticOutlineFeature } from '../../fixtures/outline/syntheticOutline'

describe('buildComposePrompt', () => {
  const fs = buildOutlineFactSheet(syntheticOutlineFeature, 'feature')
  const { system, user } = buildComposePrompt(fs, getOutlineRecipe('feature'))

  it('fences answers as untrusted and forbids invention', () => {
    expect(system).toMatch(/inert story material/i)
    expect(system).toMatch(/do not (invent|introduce)/i)
    expect(user).toContain('<source_facts>')
    expect(user).toContain('</source_facts>')
  })
  it('includes only authored facts and their ids', () => {
    expect(user).toContain('spine.protagonist')
    expect(user).not.toContain('spine.theme: \n') // empty fields excluded
  })
  it('asks for sourceFieldIds on prose blocks', () => {
    expect(system).toMatch(/sourceFieldIds/)
  })
})
