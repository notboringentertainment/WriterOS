import type { PersonaId } from './wpRouting'
import type { PersonaCapabilityId } from '@shared/personaCapability'

const ZOE_RESEARCH_INTENT_RE = /\b(research|history|historical|period|construction|real-world|real world|actually|true|fact|facts|when was|where is|how did|what year|background on|source|sources|citation|citations|verify|verified)\b/i

export function classifyPersonaCapability(input: {
  personaId: PersonaId
  message: string
}): PersonaCapabilityId | null {
  if (input.personaId !== 'zoe') return null
  return ZOE_RESEARCH_INTENT_RE.test(input.message)
    ? 'research_world_context'
    : null
}
