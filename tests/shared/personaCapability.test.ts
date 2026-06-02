import { describe, expect, it } from 'vitest'
import {
  getCapabilityContextChips,
  getMissingCapabilitySurfaces,
  isAllowedPersonaCapability,
  personaCapabilityRequestSchema,
  PERSONA_CAPABILITY_ALLOWLIST,
} from '../../shared/personaCapability'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import type { StoryBibleCharacter } from '../../shared/documents'

function makeStoryBibleCharacter(overrides: Partial<StoryBibleCharacter> = {}): StoryBibleCharacter {
  return {
    id: '',
    name: '',
    role: '',
    want: '',
    need: '',
    flaw: '',
    secret: '',
    contradiction: '',
    arc: '',
    relationshipPressure: '',
    behavioralAnchors: '',
    speechPatterns: '',
    neverWriteThemAs: '',
    continuityFacts: '',
    ...overrides,
  }
}

describe('persona capability contracts', () => {
  it('allowlists only Zoe research/world-context in Phase 2', () => {
    expect(PERSONA_CAPABILITY_ALLOWLIST).toEqual([
      expect.objectContaining({
        personaId: 'zoe',
        taskKind: 'research_world_context',
        voiceProfileSlice: 'world_context',
      }),
    ])
    expect(isAllowedPersonaCapability('zoe', 'research_world_context')).toBe(true)
    expect(isAllowedPersonaCapability('sam', 'research_world_context')).toBe(false)
  })

  it('accepts a valid writing partner capability request', () => {
    const parsed = personaCapabilityRequestSchema.parse({
      personaId: 'zoe',
      taskKind: 'research_world_context',
      message: 'research the construction period',
      projectContext: buildProjectContext(defaultProjectState()),
      sourceSurface: 'writingPartner',
      clientRequestId: 'req-1',
    })

    expect(parsed.personaId).toBe('zoe')
    expect(parsed.projectContext.format).toBe('feature')
  })

  it('normalizes missing and unknown project format values but rejects null', () => {
    const base = {
      personaId: 'zoe',
      taskKind: 'research_world_context',
      message: 'research this',
      projectContext: buildProjectContext(defaultProjectState()),
      sourceSurface: 'writingPartner',
      clientRequestId: 'req-1',
    }

    const missing = {
      ...base,
      projectContext: {
        ...base.projectContext,
        format: undefined,
      },
    }
    const unknown = {
      ...base,
      projectContext: {
        ...base.projectContext,
        format: 'pilot',
      },
    }
    const nullish = {
      ...base,
      projectContext: {
        ...base.projectContext,
        format: null,
      },
    }

    expect(personaCapabilityRequestSchema.parse(missing).projectContext.format).toBe('feature')
    expect(personaCapabilityRequestSchema.parse(unknown).projectContext.format).toBe('feature')
    expect(personaCapabilityRequestSchema.safeParse(nullish).success).toBe(false)
  })

  it('rejects disallowed persona/task pairs and Writer Room surfaces', () => {
    const base = {
      personaId: 'sam',
      taskKind: 'research_world_context',
      message: 'research this',
      projectContext: buildProjectContext(defaultProjectState()),
      sourceSurface: 'writingPartner',
      clientRequestId: 'req-1',
    }

    expect(personaCapabilityRequestSchema.safeParse(base).success).toBe(false)
    expect(personaCapabilityRequestSchema.safeParse({
      ...base,
      personaId: 'zoe',
      sourceSurface: 'writersRoom',
    }).success).toBe(false)
  })

  it('summarizes present and missing project surfaces for receipts', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'A medic exposes a corrupt rescue network.'
    state.documents.storyBible.content.premiseAndWorld.premise = 'Old City streets under layered occupation.'
    state.documents.storyBible.content.characters = [
      makeStoryBibleCharacter({ id: 'c1', name: 'Isaiah', role: 'Guide' }),
    ]

    const context = buildProjectContext(state)

    expect(getCapabilityContextChips(context)).toEqual(['logline', 'characters', 'storyBible'])
    expect(getMissingCapabilitySurfaces(context)).toEqual(['synopsis'])
  })
})
