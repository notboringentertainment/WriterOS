import { describe, it, expect } from 'vitest'
import {
  TREATMENT_PASSAGE_TEMPLATES,
  GENERIC_PASSAGE_PLACEHOLDER,
  createPassageSection,
  getPassagePlaceholder,
} from '../../client/src/lib/treatmentPassages'

const VALID_PERSONAS = new Set([
  'writingPartner',
  'sam',
  'casey',
  'oliver',
  'maya',
  'zoe',
  'alex',
])

describe('treatmentPassages catalog', () => {
  it('every template has a label, heading, and valid specialist', () => {
    expect(TREATMENT_PASSAGE_TEMPLATES.length).toBeGreaterThan(0)
    for (const template of TREATMENT_PASSAGE_TEMPLATES) {
      expect(template.label.trim()).not.toBe('')
      expect(template.heading.trim()).not.toBe('')
      expect(VALID_PERSONAS.has(template.specialist)).toBe(true)
    }
  })

  it('includes a free passage and specialist-owned passages', () => {
    const labels = TREATMENT_PASSAGE_TEMPLATES.map(template => template.label)
    expect(labels).toContain('Free passage')
    expect(labels).toContain('Character passage')
    expect(labels).toContain('Place or world passage')

    const specialists = new Set(TREATMENT_PASSAGE_TEMPLATES.map(template => template.specialist))
    expect(specialists.has('casey')).toBe(true)
    expect(specialists.has('zoe')).toBe(true)
    expect(specialists.has('oliver')).toBe(true)
  })

  it('createPassageSection inserts the heading with an empty body', () => {
    const template = TREATMENT_PASSAGE_TEMPLATES.find(item => item.id === 'character')
    expect(template).toBeDefined()
    const section = createPassageSection(template!)
    expect(section.heading).toBe('Character passage')
    expect(section.body).toBe('')
    expect(section.id).toBeTruthy()
  })

  it('createPassageSection produces unique ids', () => {
    const template = TREATMENT_PASSAGE_TEMPLATES[0]
    expect(createPassageSection(template).id).not.toBe(createPassageSection(template).id)
  })

  it('getPassagePlaceholder returns the template placeholder for a known heading', () => {
    expect(getPassagePlaceholder('Character passage')).toMatch(/follow one character/i)
  })

  it('getPassagePlaceholder falls back to the generic placeholder for an unknown heading', () => {
    expect(getPassagePlaceholder('A heading the writer renamed')).toBe(GENERIC_PASSAGE_PLACEHOLDER)
  })

  it('the free passage template carries an empty placeholder', () => {
    const free = TREATMENT_PASSAGE_TEMPLATES.find(template => template.id === 'free')
    expect(free).toBeDefined()
    expect(free!.placeholder).toBe('')
  })

  it('getPassagePlaceholder honours the free passage empty placeholder', () => {
    const free = TREATMENT_PASSAGE_TEMPLATES.find(template => template.id === 'free')!
    expect(getPassagePlaceholder(free.heading)).toBe('')
  })
})
