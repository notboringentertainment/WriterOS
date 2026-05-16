import { z } from 'zod'

export const SynopsisHeaderSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  targetRuntime: z.string(),
  comps: z.array(z.string()),
})

export const SynopsisLoglineSchema = z.object({
  text: z.string(),
  protagonist: z.string(),
  goal: z.string(),
  obstacle: z.string(),
  stakes: z.string(),
  hook: z.string(),
})

export const SynopsisProseSchema = z.object({
  opening: z.string(),
  escalation: z.string(),
  middle: z.string(),
  climax: z.string(),
  resolution: z.string(),
})

export const SynopsisQaSchema = z.object({
  protagonistNamedEarly: z.boolean(),
  goalClear: z.boolean(),
  obstacleClear: z.boolean(),
  stakesClear: z.boolean(),
  endingRevealed: z.boolean(),
  paragraphsConnectCausally: z.boolean(),
  toneMatchesProject: z.boolean(),
  noUnnecessarySubplot: z.boolean(),
})

export const SynopsisAiProductionSchema = z.object({
  visuallyImportantSequences: z.string(),
  continuitySensitiveMoments: z.string(),
  difficultWorldOrVfx: z.string(),
  likelyReferenceImageNeeds: z.string(),
})

export const SynopsisDocumentContentSchema = z.object({
  header: SynopsisHeaderSchema,
  logline: SynopsisLoglineSchema,
  prose: SynopsisProseSchema,
  qa: SynopsisQaSchema,
  aiProductionImplications: SynopsisAiProductionSchema.optional(),
})

export type SynopsisDocumentContent = z.infer<typeof SynopsisDocumentContentSchema>

export function createEmptySynopsisContent(): SynopsisDocumentContent {
  return {
    header: { title: '', writer: '', format: '', genre: '', targetRuntime: '', comps: [] },
    logline: { text: '', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' },
    prose: { opening: '', escalation: '', middle: '', climax: '', resolution: '' },
    qa: {
      protagonistNamedEarly: false,
      goalClear: false,
      obstacleClear: false,
      stakesClear: false,
      endingRevealed: false,
      paragraphsConnectCausally: false,
      toneMatchesProject: false,
      noUnnecessarySubplot: false,
    },
  }
}
