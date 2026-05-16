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

export const OutlineModeSchema = z.enum([
  'beat_sheet_save_the_cat',
  'feature_sequence',
  'scene_by_scene',
  'episode',
  'season_serialized',
  'custom',
])
export type OutlineMode = z.infer<typeof OutlineModeSchema>

export const OutlineStructureModelSchema = z.enum([
  'three_act',
  'five_act',
  'eight_sequence',
  'save_the_cat',
  'episode_acts',
  'custom',
])

export const OutlineSpineSchema = z.object({
  protagonist: z.string(),
  externalGoal: z.string(),
  internalNeed: z.string(),
  centralOpposition: z.string(),
  coreStakes: z.string(),
  theme: z.string(),
  ending: z.string(),
})

export const OutlineUnitSchema = z.object({
  id: z.string(),
  number: z.number(),
  actOrSequence: z.string(),
  title: z.string(),
  location: z.string(),
  characters: z.array(z.string()),
  whatHappens: z.string(),
  conflict: z.string(),
  turn: z.string(),
  consequence: z.string(),
  whyNext: z.string(),
  linkedSceneIds: z.array(z.string()),
  draftNotes: z.string(),
  aiProduction: z
    .object({
      productionDifficulty: z.string(),
      requiredReferences: z.string(),
      continuityRisks: z.string(),
      promptNotes: z.string(),
      assetStatus: z.string(),
    })
    .optional(),
})
export type OutlineUnit = z.infer<typeof OutlineUnitSchema>

export const OutlineDocumentContentSchema = z.object({
  mode: OutlineModeSchema,
  structureModel: OutlineStructureModelSchema,
  spine: OutlineSpineSchema,
  units: z.array(OutlineUnitSchema),
  aiProductionColumns: z.object({ enabled: z.boolean() }),
})
export type OutlineDocumentContent = z.infer<typeof OutlineDocumentContentSchema>

export function createEmptyOutlineContent(): OutlineDocumentContent {
  return {
    mode: 'beat_sheet_save_the_cat',
    structureModel: 'save_the_cat',
    spine: {
      protagonist: '',
      externalGoal: '',
      internalNeed: '',
      centralOpposition: '',
      coreStakes: '',
      theme: '',
      ending: '',
    },
    units: [],
    aiProductionColumns: { enabled: false },
  }
}
