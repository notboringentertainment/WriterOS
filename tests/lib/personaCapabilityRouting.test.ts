import { describe, expect, it } from 'vitest'
import { classifyPersonaCapability } from '../../client/src/lib/personaCapabilityRouting'

describe('classifyPersonaCapability', () => {
  it('routes Zoe research-shaped world-context requests to the Phase 2 capability', () => {
    expect(classifyPersonaCapability({
      personaId: 'zoe',
      message: 'Research the construction period of Damascus Gate before this scene.',
    })).toBe('research_world_context')

    expect(classifyPersonaCapability({
      personaId: 'zoe',
      message: 'What year was this gate built and how did tour guides talk about it?',
    })).toBe('research_world_context')
  })

  it('keeps non-research Zoe messages direct', () => {
    expect(classifyPersonaCapability({
      personaId: 'zoe',
      message: 'Give me color for this threshold scene.',
    })).toBeNull()
  })

  it('does not route other personas through the Zoe capability', () => {
    expect(classifyPersonaCapability({
      personaId: 'sam',
      message: 'Research current comps for this premise.',
    })).toBeNull()
  })
})
