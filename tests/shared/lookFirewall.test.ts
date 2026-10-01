import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findFirewallProblems } from '../../shared/lookSpec'

const character = () =>
  JSON.parse(readFileSync(resolve(__dirname, '../fixtures/lookSpec/synthetic-character.json'), 'utf8')) as Record<string, unknown>

describe('reference-image firewall', () => {
  it('does nothing unless the reference is casting-inspiration', () => {
    expect(findFirewallProblems(character(), 'none')).toEqual([])
    expect(findFirewallProblems(character(), 'generated-elsewhere')).toEqual([])
  })

  it('refuses distinguishing marks and face words under casting-inspiration', () => {
    const problems = findFirewallProblems(character(), 'casting-inspiration')
    expect(problems.map(problem => problem.path)).toContain('distinguishing_marks')
    expect(problems.map(problem => problem.path)).toContain('prompt_safe_description') // "grey eyes"
  })

  it('catches plurals, multi-word phrases and every checked field', () => {
    const clean = { ...character(), distinguishing_marks: [], prompt_safe_description: 'A tall courier in a rust coat.' }
    expect(findFirewallProblems(clean, 'casting-inspiration')).toEqual([])
    for (const [field, value] of [
      ['continuity_risks', ['freckles drift']],
      ['negative_lines', ['no Scar  on\tthe face']],
      ['props', ['a mirror for her cheekbones']],
      ['prompt_safe_description', 'Deep dimples when amused.'],
    ] as const) {
      expect(findFirewallProblems({ ...clean, [field]: value }, 'casting-inspiration').length).toBe(1)
    }
  })

  it('does not match face words inside other words', () => {
    const clean = { ...character(), distinguishing_marks: [], prompt_safe_description: 'Surface wear, a skinny tie, a noseband on the horse, a chinook wind.' }
    expect(findFirewallProblems(clean, 'casting-inspiration')).toEqual([])
  })

  it('checks every free-text field the generator reads, not just the description', () => {
    const clean = { ...character(), distinguishing_marks: [], prompt_safe_description: 'A tall courier in a rust coat.' }
    for (const [field, value] of [
      ['hair', 'cropped hair above blue eyes and a sharp jaw'],
      ['build', { kind: 'lean', note: 'narrow face' }],
      ['default_wardrobe', { pieces: ['scarf over the chin'] }],
      ['wardrobe_variants', [{ name: 'night', when: 'hood hides the face' }]],
      ['era_and_class_signals', 'weathered skin of a dock worker'],
      ['heritage_note', 'her mother\'s cheekbones'],
    ] as const) {
      expect(findFirewallProblems({ ...clean, [field]: value }, 'casting-inspiration').length, field).toBe(1)
    }
  })
})

