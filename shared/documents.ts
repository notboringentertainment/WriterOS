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

export const TreatmentHeaderSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  version: z.string(),
  date: z.string(),
})

export const TreatmentConceptSchema = z.object({
  premise: z.string(),
  tone: z.string(),
  theme: z.string(),
  emotionalPromise: z.string(),
})

export const TreatmentMainCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  externalWant: z.string(),
  internalNeed: z.string(),
  flawOrWound: z.string(),
  secretOrContradiction: z.string(),
  arc: z.string(),
  relationshipPressure: z.string(),
})

export const TreatmentProseSchema = z.object({
  opening: z.string(),
  actOne: z.string(),
  actTwo: z.string(),
  actThree: z.string(),
  customSections: z.array(z.object({ id: z.string(), heading: z.string(), body: z.string() })),
})

export const TreatmentVisualAndTonalSchema = z.object({
  overallTone: z.string(),
  visualWorld: z.string(),
  recurringImagesOrMotifs: z.string(),
  musicOrSoundFeeling: z.string(),
  pacing: z.string(),
  genreRules: z.string(),
  compsAndReferences: z.string(),
})

export const TreatmentOpenQuestionsSchema = z.object({
  story: z.array(z.string()),
  character: z.array(z.string()),
  worldOrMythology: z.array(z.string()),
  production: z.array(z.string()),
})

export const TreatmentAiProductionSchema = z.object({
  visualSequenceRisks: z.string(),
  characterContinuityRisks: z.string(),
  locationContinuityRisks: z.string(),
  vfxOrGenerationChallenges: z.string(),
  referenceAssetsNeeded: z.string(),
})

export const TreatmentDocumentContentSchema = z.object({
  header: TreatmentHeaderSchema,
  logline: z.string(),
  concept: TreatmentConceptSchema,
  mainCharacters: z.array(TreatmentMainCharacterSchema),
  prose: TreatmentProseSchema,
  visualAndTonal: TreatmentVisualAndTonalSchema,
  openQuestions: TreatmentOpenQuestionsSchema,
  aiProductionImplications: TreatmentAiProductionSchema.optional(),
})
export type TreatmentDocumentContent = z.infer<typeof TreatmentDocumentContentSchema>

export function createEmptyTreatmentContent(): TreatmentDocumentContent {
  return {
    header: { title: '', writer: '', format: '', genre: '', version: '', date: '' },
    logline: '',
    concept: { premise: '', tone: '', theme: '', emotionalPromise: '' },
    mainCharacters: [],
    prose: { opening: '', actOne: '', actTwo: '', actThree: '', customSections: [] },
    visualAndTonal: {
      overallTone: '',
      visualWorld: '',
      recurringImagesOrMotifs: '',
      musicOrSoundFeeling: '',
      pacing: '',
      genreRules: '',
      compsAndReferences: '',
    },
    openQuestions: { story: [], character: [], worldOrMythology: [], production: [] },
  }
}
