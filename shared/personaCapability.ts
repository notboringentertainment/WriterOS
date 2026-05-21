import { z } from 'zod'
import { normalizeProjectFormat, type ProjectFormat } from './projectFormat'

export type PersonaCapabilityId = 'research_world_context'
export type PersonaCapabilityPersonaId = 'zoe'
export type PersonaCapabilityStatus = 'ok' | 'soft_fail' | 'timeout' | 'cancelled'
export type PersonaCapabilityFailureReason = 'timeout' | 'upstream_error' | 'invalid_upstream' | 'aborted'
export type VoiceProfileSliceKind = 'world_context' | 'none'
export type PersonaCapabilitySourceSurface = 'writingPartner'

export type CapabilityContextChip =
  | 'logline'
  | 'synopsis'
  | 'storyBible'
  | 'characters'
  | 'scriptExcerpt'

export type CapabilityMissingSurface =
  | 'logline'
  | 'synopsis'
  | 'storyBible'
  | 'characters'

export interface PersonaCapabilityAllowlistEntry {
  personaId: PersonaCapabilityPersonaId
  taskKind: PersonaCapabilityId
  voiceProfileSlice: VoiceProfileSliceKind
  upstreamRecipient: 'Deep Research Agent' | 'Writing Partner'
  softTimeoutMs: number
}

export interface WorldContextVoiceProfileSlice {
  slice: 'world_context'
  displayName?: string
  archetype: string
  coreStatement: string
  storytellingDNA: {
    recurringThemes: string[]
  }
  influences: {
    notes: string
  }
  visualLanguage: {
    instincts: string[]
    notes: string
  }
}

export interface CapabilityReceiptSource {
  label: string
  url?: string
  citedInFinal: boolean
}

export interface CapabilityReceipt {
  schemaVersion: 1
  taskKind: PersonaCapabilityId
  personaId: PersonaCapabilityPersonaId
  startedAt: string
  completedAt: string
  durationMs: number
  status: PersonaCapabilityStatus
  contextChips: CapabilityContextChip[]
  voiceProfile: {
    included: boolean
    slice: VoiceProfileSliceKind
  }
  missingSurfaces: CapabilityMissingSurface[]
  sources: CapabilityReceiptSource[]
  failureReason?: PersonaCapabilityFailureReason
}

export interface PersonaCapabilityProjectContext {
  title?: string
  genre?: string
  format: ProjectFormat
  logline?: string
  script?: {
    excerpt: string
    sceneHeadings: string[]
    dialogueSnippets: string[]
    actionSnippets: string[]
    characterNames: string[]
    excerptWordCount: number
    excerptWordLimit: number
    excerptTruncated: boolean
    totalWordCount: number
    estimatedPageCount: number
    sceneCount: number
    contextReason?: string
    contextLabel?: string
    pageRange?: { start: number; end: number }
    selectedText?: string
  }
  synopsis: {
    logline: string
    sections: {
      setup: string
      act1Break: string
      midpoint: string
      act2Break: string
      resolution: string
    }
  }
  characters: Array<{
    id: string
    name: string
    role: string
    wound: string
    want: string
    need: string
    arc: string
  }>
  beats: Array<{
    id: string
    name: string
    description: string
    notes: string
    linkedSceneIds: string[]
  }>
  treatment: {
    logline: string
    concept: {
      premise: string
      tone: string
      theme: string
      emotionalPromise: string
    }
    prose: {
      opening: string
      actOne: string
      actTwo: string
      actThree: string
      customSections: Array<{ id: string; heading: string; body: string }>
    }
  }
  scenes: Array<{
    id: string
    heading: string
    index: number
  }>
  storyBible: {
    themes: string
    rules: string
    world: {
      setting: string
      toneAnchors: string
      voiceNotes: string
    }
  }
  world: {
    setting: string
    toneAnchors: string
    voiceNotes: string
  }
}

export interface PersonaCapabilityRequest {
  personaId: PersonaCapabilityPersonaId
  taskKind: PersonaCapabilityId
  message: string
  projectContext: PersonaCapabilityProjectContext
  voiceProfile?: WorldContextVoiceProfileSlice
  sourceSurface: PersonaCapabilitySourceSurface
  clientRequestId: string
}

export interface PersonaCapabilityResponse {
  finalMessage: string
  receipt: CapabilityReceipt
  status: PersonaCapabilityStatus
}

export const PERSONA_CAPABILITY_ALLOWLIST: readonly PersonaCapabilityAllowlistEntry[] = [
  {
    personaId: 'zoe',
    taskKind: 'research_world_context',
    voiceProfileSlice: 'world_context',
    upstreamRecipient: 'Deep Research Agent',
    softTimeoutMs: 240_000,
  },
] as const

const stringArraySchema = z.array(z.string()).default([])

const capabilityTreatmentContextSchema = z.object({
  logline: z.string().default(''),
  concept: z.object({
    premise: z.string().default(''),
    tone: z.string().default(''),
    theme: z.string().default(''),
    emotionalPromise: z.string().default(''),
  }).default({}),
  prose: z.object({
    opening: z.string().default(''),
    actOne: z.string().default(''),
    actTwo: z.string().default(''),
    actThree: z.string().default(''),
    customSections: z.array(z.object({
      id: z.string().default(''),
      heading: z.string().default(''),
      body: z.string().default(''),
    })).default([]),
  }).default({}),
}).default({})

export const worldContextVoiceProfileSliceSchema = z.object({
  slice: z.literal('world_context'),
  displayName: z.string().optional(),
  archetype: z.string(),
  coreStatement: z.string(),
  storytellingDNA: z.object({
    recurringThemes: stringArraySchema,
  }),
  influences: z.object({
    notes: z.string(),
  }),
  visualLanguage: z.object({
    instincts: stringArraySchema,
    notes: z.string(),
  }),
}).strict()

const scriptContextSchema = z.object({
  excerpt: z.string().default(''),
  sceneHeadings: stringArraySchema,
  dialogueSnippets: stringArraySchema,
  actionSnippets: stringArraySchema,
  characterNames: stringArraySchema,
  excerptWordCount: z.number().default(0),
  excerptWordLimit: z.number().default(500),
  excerptTruncated: z.boolean().default(false),
  totalWordCount: z.number().default(0),
  estimatedPageCount: z.number().default(0),
  sceneCount: z.number().default(0),
  contextReason: z.string().optional(),
  contextLabel: z.string().optional(),
  pageRange: z.object({
    start: z.number(),
    end: z.number(),
  }).optional(),
  selectedText: z.string().optional(),
}).optional()

export const personaCapabilityProjectContextSchema = z.object({
  title: z.string().optional(),
  genre: z.string().optional(),
  format: z.string().default('feature').transform(normalizeProjectFormat),
  logline: z.string().optional(),
  script: scriptContextSchema,
  synopsis: z.object({
    logline: z.string(),
    sections: z.object({
      setup: z.string(),
      act1Break: z.string(),
      midpoint: z.string(),
      act2Break: z.string(),
      resolution: z.string(),
    }),
  }),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    wound: z.string(),
    want: z.string(),
    need: z.string(),
    arc: z.string(),
  })),
  beats: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    notes: z.string(),
    linkedSceneIds: stringArraySchema,
  })),
  treatment: capabilityTreatmentContextSchema,
  scenes: z.array(z.object({
    id: z.string(),
    heading: z.string(),
    index: z.number(),
  })),
  storyBible: z.object({
    themes: z.string().default(''),
    rules: z.string().default(''),
    world: z.object({
      setting: z.string().default(''),
      toneAnchors: z.string().default(''),
      voiceNotes: z.string().default(''),
    }),
  }),
  world: z.object({
    setting: z.string().default(''),
    toneAnchors: z.string().default(''),
    voiceNotes: z.string().default(''),
  }),
})

const personaCapabilityRequestBaseSchema = z.object({
  personaId: z.string(),
  taskKind: z.enum(['research_world_context']),
  message: z.string().trim().min(1),
  projectContext: personaCapabilityProjectContextSchema,
  voiceProfile: worldContextVoiceProfileSliceSchema.optional(),
  sourceSurface: z.literal('writingPartner'),
  clientRequestId: z.string().min(1),
}).strict()

export const personaCapabilityRequestSchema = personaCapabilityRequestBaseSchema
  .superRefine((value, ctx) => {
    if (!isAllowedPersonaCapability(value.personaId, value.taskKind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'persona capability pair is not allowlisted',
        path: ['personaId'],
      })
    }
  })
  .transform(value => value as PersonaCapabilityRequest) as z.ZodType<PersonaCapabilityRequest>

export const capabilityReceiptSchema: z.ZodType<CapabilityReceipt> = z.object({
  schemaVersion: z.literal(1),
  taskKind: z.literal('research_world_context'),
  personaId: z.literal('zoe'),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  status: z.enum(['ok', 'soft_fail', 'timeout', 'cancelled']),
  contextChips: z.array(z.enum(['logline', 'synopsis', 'storyBible', 'characters', 'scriptExcerpt'])),
  voiceProfile: z.object({
    included: z.boolean(),
    slice: z.enum(['world_context', 'none']),
  }),
  missingSurfaces: z.array(z.enum(['logline', 'synopsis', 'storyBible', 'characters'])),
  sources: z.array(z.object({
    label: z.string(),
    url: z.string().url().refine(
      value => value.startsWith('http://') || value.startsWith('https://'),
      { message: 'url must be http(s)' }
    ).optional(),
    citedInFinal: z.boolean(),
  })),
  failureReason: z.enum(['timeout', 'upstream_error', 'invalid_upstream', 'aborted']).optional(),
})

export const personaCapabilityResponseSchema: z.ZodType<PersonaCapabilityResponse> = z.object({
  finalMessage: z.string(),
  receipt: capabilityReceiptSchema,
  status: z.enum(['ok', 'soft_fail', 'timeout', 'cancelled']),
})

export function isAllowedPersonaCapability(
  personaId: string,
  taskKind: string
): personaId is PersonaCapabilityPersonaId {
  return PERSONA_CAPABILITY_ALLOWLIST.some(entry =>
    entry.personaId === personaId && entry.taskKind === taskKind
  )
}

export function getPersonaCapabilityAllowlistEntry(
  personaId: PersonaCapabilityPersonaId,
  taskKind: PersonaCapabilityId
): PersonaCapabilityAllowlistEntry | undefined {
  return PERSONA_CAPABILITY_ALLOWLIST.find(entry =>
    entry.personaId === personaId && entry.taskKind === taskKind
  )
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function getCapabilityContextChips(
  projectContext: PersonaCapabilityProjectContext
): CapabilityContextChip[] {
  const chips: CapabilityContextChip[] = []

  if (filled(projectContext.logline) || filled(projectContext.synopsis.logline)) {
    chips.push('logline')
  }

  if (Object.values(projectContext.synopsis.sections).some(filled)) {
    chips.push('synopsis')
  }

  if (projectContext.characters.some(character => filled(character.name))) {
    chips.push('characters')
  }

  if (
    filled(projectContext.storyBible.themes) ||
    filled(projectContext.storyBible.rules) ||
    filled(projectContext.storyBible.world.setting) ||
    filled(projectContext.storyBible.world.toneAnchors) ||
    filled(projectContext.storyBible.world.voiceNotes)
  ) {
    chips.push('storyBible')
  }

  if (filled(projectContext.script?.excerpt) || filled(projectContext.script?.selectedText)) {
    chips.push('scriptExcerpt')
  }

  return chips
}

export function getMissingCapabilitySurfaces(
  projectContext: PersonaCapabilityProjectContext
): CapabilityMissingSurface[] {
  const missing: CapabilityMissingSurface[] = []
  const chips = new Set(getCapabilityContextChips(projectContext))

  if (!chips.has('logline')) missing.push('logline')
  if (!chips.has('synopsis')) missing.push('synopsis')
  if (!chips.has('storyBible')) missing.push('storyBible')
  if (!chips.has('characters')) missing.push('characters')

  return missing
}
