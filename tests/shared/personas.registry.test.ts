import { describe, it, expect } from 'vitest'
import { CALLABLE_SPECIALIST_IDS, isCallableSpecialist, PERSONAS } from '../../shared/personas'

describe('callable specialist registry', () => {
  it('is exactly the six room specialists, lowercase', () => {
    expect([...CALLABLE_SPECIALIST_IDS].sort()).toEqual(['alex', 'casey', 'maya', 'oliver', 'sam', 'zoe'])
  })

  it('never includes writingPartner', () => {
    expect(CALLABLE_SPECIALIST_IDS as readonly string[]).not.toContain('writingPartner')
  })

  it('every callable id resolves to a real persona', () => {
    for (const id of CALLABLE_SPECIALIST_IDS) expect(PERSONAS[id]).toBeTruthy()
  })

  it('isCallableSpecialist accepts the six and rejects writingPartner + unknown', () => {
    expect(isCallableSpecialist('zoe')).toBe(true)
    expect(isCallableSpecialist('writingPartner')).toBe(false)
    expect(isCallableSpecialist('nobody')).toBe(false)
  })
})
