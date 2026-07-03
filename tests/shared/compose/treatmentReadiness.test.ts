import { describe, expect, it } from 'vitest'
import { buildTreatmentFactSheet } from '../../../shared/compose/treatmentFactSheet'
import { getTreatmentRecipe } from '../../../shared/compose/treatmentRecipe'
import { getTreatmentReadiness } from '../../../shared/compose/treatmentReadiness'
import { createEmptyTreatmentContent, type TreatmentDocumentContent } from '../../../shared/documents'

function readiness(mutate: (c: TreatmentDocumentContent) => void, format: 'feature' | 'series' = 'feature') {
  const content = createEmptyTreatmentContent()
  mutate(content)
  return getTreatmentReadiness(buildTreatmentFactSheet(content, format), getTreatmentRecipe(format))
}

function fillMovements(c: TreatmentDocumentContent, count: number) {
  const movements = ['opening', 'actOne', 'actTwo', 'actThree'] as const
  movements.slice(0, count).forEach(m => { c.prose[m] = `${m} text` })
}

describe('getTreatmentReadiness', () => {
  describe('story-engine disjunction (logline OR premise)', () => {
    it('both logline and premise empty ⇒ sparse with the human OR label', () => {
      const r = readiness(c => fillMovements(c, 4))
      expect(r.tier).toBe('sparse')
      expect(r.missingCoreLabels).toContain('A logline or premise')
    })

    it('logline empty, premise filled ⇒ NOT hard-disabled', () => {
      const r = readiness(c => { c.concept.premise = 'P'; fillMovements(c, 4) })
      expect(r.tier).not.toBe('sparse')
    })

    it('premise empty, logline filled ⇒ NOT hard-disabled', () => {
      const r = readiness(c => { c.logline = 'L'; fillMovements(c, 4) })
      expect(r.tier).not.toBe('sparse')
    })
  })

  describe('movement gate (<2 of 4 hard-disables)', () => {
    it('zero movements ⇒ sparse', () => {
      const r = readiness(c => { c.logline = 'L' })
      expect(r.tier).toBe('sparse')
      expect(r.missingCoreLabels).toContain('At least two story movements')
    })

    it('exactly one movement ⇒ sparse', () => {
      const r = readiness(c => { c.logline = 'L'; fillMovements(c, 1) })
      expect(r.tier).toBe('sparse')
    })

    it('exactly two movements ⇒ NOT hard-disabled', () => {
      const r = readiness(c => { c.logline = 'L'; fillMovements(c, 2) })
      expect(r.tier).not.toBe('sparse')
    })

    it('custom sections do not count toward the movement gate', () => {
      const r = readiness(c => {
        c.logline = 'L'
        fillMovements(c, 1)
        c.prose.customSections = [
          { id: 'p1', heading: 'A', body: 'Passage one.' },
          { id: 'p2', heading: 'B', body: 'Passage two.' },
        ]
      })
      expect(r.tier).toBe('sparse')
    })
  })

  describe('partial (missing-context)', () => {
    it('missing act three ⇒ partial, never sparse, never rich', () => {
      const r = readiness(c => {
        c.logline = 'L'
        c.prose.opening = 'O'; c.prose.actOne = 'A1'; c.prose.actTwo = 'A2'
        c.mainCharacters = [charNamed('Mara')]
      })
      expect(r.tier).toBe('partial')
    })

    it('all movements present but no named character ⇒ partial', () => {
      const r = readiness(c => { c.logline = 'L'; fillMovements(c, 4) })
      expect(r.tier).toBe('partial')
    })

    it('a character with an empty name does not count as a named character', () => {
      const r = readiness(c => {
        c.logline = 'L'; fillMovements(c, 4)
        c.mainCharacters = [{ ...charNamed(''), role: 'Lead' }]
      })
      expect(r.tier).toBe('partial')
    })
  })

  describe('rich', () => {
    it('engine + all four movements + a named character ⇒ rich', () => {
      const r = readiness(c => {
        c.concept.premise = 'P'
        fillMovements(c, 4)
        c.mainCharacters = [charNamed('Mara')]
      })
      expect(r.tier).toBe('rich')
      expect(r.missingCoreLabels).toEqual([])
    })

    it('rich does not require tone, theme, visualAndTonal, or custom sections', () => {
      const r = readiness(c => {
        c.logline = 'L'
        fillMovements(c, 4)
        c.mainCharacters = [charNamed('Mara')]
      })
      expect(r.tier).toBe('rich')
    })
  })

  it('reports omitted omittable section headings without gating the tier', () => {
    const r = readiness(c => {
      c.logline = 'L'
      fillMovements(c, 4)
      c.mainCharacters = [charNamed('Mara')]
    })
    expect(r.tier).toBe('rich')
    expect(r.omittedSectionHeadings).toContain('Concept')
    expect(r.omittedSectionHeadings).toContain('Visual and Tonal Language')
  })

  it('format does not change the gates (series mirrors feature)', () => {
    const sparse = readiness(c => { c.logline = 'L'; fillMovements(c, 1) }, 'series')
    expect(sparse.tier).toBe('sparse')
    const rich = readiness(c => {
      c.logline = 'L'; fillMovements(c, 4); c.mainCharacters = [charNamed('Mara')]
    }, 'series')
    expect(rich.tier).toBe('rich')
  })
})

function charNamed(name: string) {
  return {
    id: 'c1', name, role: '', externalWant: '', internalNeed: '',
    flawOrWound: '', secretOrContradiction: '', arc: '', relationshipPressure: '',
  }
}
