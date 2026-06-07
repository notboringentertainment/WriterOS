import { describe, expect, it } from 'vitest'
import { buildEntityInventory, traceEntity, traceNumber } from '../../../server/compose/entityInventory'
import type { FactSheet } from '../../../shared/compose/types'

const fs: FactSheet = {
  surface: 'outline', format: 'feature',
  fields: [
    { id: 'spine.protagonist', label: 'Protagonist', kind: 'name', value: 'Vera Solano' },
    { id: 'feature.midpoint.whatHappens', label: 'x', kind: 'prose', value: 'She meets the Meridian Group at 3 a.m.' },
  ],
}

describe('entityInventory', () => {
  it('collects multi-word capitalized names and numbers', () => {
    const inv = buildEntityInventory(fs)
    expect(inv.names).toContain('Vera Solano')
    expect(inv.names).toContain('Meridian Group')
  })
  it('traces a known entity and misses an invented one', () => {
    const inv = buildEntityInventory(fs)
    expect(traceEntity('Vera Solano', inv)).toBe(true)
    expect(traceEntity('Kane Yoshida', inv)).toBe(false)
  })
  it('collects and traces numbers, missing invented ones', () => {
    const inv = buildEntityInventory(fs)
    expect(inv.numbers).toContain('3')
    expect(traceNumber('3', inv)).toBe(true)
    expect(traceNumber('4', inv)).toBe(false)
  })
})
