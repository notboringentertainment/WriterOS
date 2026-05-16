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

export const SynopsisSeriesTypeSchema = z.enum(['limited', 'ongoing'])
export type SynopsisSeriesType = z.infer<typeof SynopsisSeriesTypeSchema>

export const SynopsisEpisodeLengthSchema = z.enum(['half_hour', 'hour', 'other'])
export type SynopsisEpisodeLength = z.infer<typeof SynopsisEpisodeLengthSchema>

export const SynopsisFutureSeasonSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
})
export type SynopsisFutureSeason = z.infer<typeof SynopsisFutureSeasonSchema>

export const SynopsisSeriesCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  arcPerSeason: z.array(z.string()),
})
export type SynopsisSeriesCharacter = z.infer<typeof SynopsisSeriesCharacterSchema>

export const SynopsisPilotSchema = z.object({
  logline: z.string(),
  prose: z.string(),
})

export const SynopsisSeriesContentSchema = z.object({
  seriesType: SynopsisSeriesTypeSchema,
  episodeLength: SynopsisEpisodeLengthSchema,
  showOverview: z.string(),
  pilot: SynopsisPilotSchema,
  seasonOneArc: z.string(),
  futureSeasons: z.array(SynopsisFutureSeasonSchema),
  characters: z.array(SynopsisSeriesCharacterSchema),
  compsAndWhyThisShowNow: z.string(),
})
export type SynopsisSeriesContent = z.infer<typeof SynopsisSeriesContentSchema>

export function createEmptySeriesContent(): SynopsisSeriesContent {
  return {
    seriesType: 'ongoing',
    episodeLength: 'hour',
    showOverview: '',
    pilot: { logline: '', prose: '' },
    seasonOneArc: '',
    futureSeasons: [],
    characters: [],
    compsAndWhyThisShowNow: '',
  }
}

export const SynopsisDocumentContentSchema = z.object({
  header: SynopsisHeaderSchema,
  logline: SynopsisLoglineSchema,
  prose: SynopsisProseSchema,
  qa: SynopsisQaSchema,
  aiProductionImplications: SynopsisAiProductionSchema.optional(),
  series: SynopsisSeriesContentSchema.optional(),
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

export const StoryBibleStatusSchema = z.enum(['pitch', 'development', 'production', 'living_canon'])
export type StoryBibleStatus = z.infer<typeof StoryBibleStatusSchema>

export const StoryBibleCoverSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  version: z.string(),
  dateUpdated: z.string(),
  status: StoryBibleStatusSchema,
})

export const StoryBibleOnePagePitchSchema = z.object({
  logline: z.string(),
  inANutshell: z.string(),
  whyThisMatters: z.string(),
  corePromise: z.string(),
  centralQuestion: z.string(),
  whatMakesItDifferent: z.string(),
})

export const StoryBibleToneAndStyleSchema = z.object({
  toneWords: z.array(z.string()),
  comps: z.array(z.string()),
  antiComps: z.array(z.string()),
  pacingRules: z.string(),
  humorRules: z.string(),
  violenceOrIntensityRules: z.string(),
  dialogueStyle: z.string(),
  visualStyle: z.string(),
  soundOrMusicStyle: z.string(),
  mustNeverFeelLike: z.string(),
})

export const StoryBiblePremiseAndWorldSchema = z.object({
  premise: z.string(),
  worldRules: z.string(),
  publicHistory: z.string(),
  hiddenHistory: z.string(),
  mythologyReveals: z.string(),
})

export const StoryBibleCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  want: z.string(),
  need: z.string(),
  flaw: z.string(),
  secret: z.string(),
  contradiction: z.string(),
  arc: z.string(),
  relationshipPressure: z.string(),
  behavioralAnchors: z.string(),
  speechPatterns: z.string(),
  neverWriteThemAs: z.string(),
  continuityFacts: z.string(),
})
export type StoryBibleCharacter = z.infer<typeof StoryBibleCharacterSchema>

export const StoryBibleStoryEngineSchema = z.object({
  featurePropulsion: z.string(),
  seriesEngine: z.string(),
  pilotEngine: z.string(),
  seasonArc: z.string(),
  futureSeasonPotential: z.string(),
  whatKeepsThePremiseAlive: z.string(),
})

export const StoryBibleMapEntrySchema = z.object({
  id: z.string(),
  unit: z.string(),
  title: z.string(),
  storyEvents: z.string(),
})

export const StoryBibleDocumentContentSchema = z.object({
  cover: StoryBibleCoverSchema,
  onePagePitch: StoryBibleOnePagePitchSchema,
  toneAndStyle: StoryBibleToneAndStyleSchema,
  premiseAndWorld: StoryBiblePremiseAndWorldSchema,
  characters: z.array(StoryBibleCharacterSchema),
  storyEngine: StoryBibleStoryEngineSchema,
  episodeOrSequenceMap: z.array(StoryBibleMapEntrySchema),
})
export type StoryBibleDocumentContent = z.infer<typeof StoryBibleDocumentContentSchema>

export function createEmptyStoryBibleContent(): StoryBibleDocumentContent {
  return {
    cover: {
      title: '',
      writer: '',
      format: '',
      genre: '',
      version: '',
      dateUpdated: '',
      status: 'development',
    },
    onePagePitch: {
      logline: '',
      inANutshell: '',
      whyThisMatters: '',
      corePromise: '',
      centralQuestion: '',
      whatMakesItDifferent: '',
    },
    toneAndStyle: {
      toneWords: [],
      comps: [],
      antiComps: [],
      pacingRules: '',
      humorRules: '',
      violenceOrIntensityRules: '',
      dialogueStyle: '',
      visualStyle: '',
      soundOrMusicStyle: '',
      mustNeverFeelLike: '',
    },
    premiseAndWorld: {
      premise: '',
      worldRules: '',
      publicHistory: '',
      hiddenHistory: '',
      mythologyReveals: '',
    },
    characters: [],
    storyEngine: {
      featurePropulsion: '',
      seriesEngine: '',
      pilotEngine: '',
      seasonArc: '',
      futureSeasonPotential: '',
      whatKeepsThePremiseAlive: '',
    },
    episodeOrSequenceMap: [],
  }
}

export const DocumentWarningSchema = z.object({
  id: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warn', 'error']),
})
export type DocumentWarning = z.infer<typeof DocumentWarningSchema>

export const DocumentViewPreferencesSchema = z.object({
  activeView: z.enum(['edit', 'document']).optional(),
  collapsedSections: z.array(z.string()).optional(),
  visibleDepth: z.enum(['core', 'advanced', 'continuity', 'ai_production']).optional(),
  synopsisComposeMode: z.enum(['prose', 'paragraphs']).optional(),
})
export type DocumentViewPreferences = z.infer<typeof DocumentViewPreferencesSchema>

export function AuthoredDocumentStateSchema<TContent extends z.ZodTypeAny>(content: TContent) {
  return z.object({
    version: z.number().int().nonnegative(),
    mode: z.string(),
    updatedAt: z.string(),
    content,
    viewPreferences: DocumentViewPreferencesSchema.optional(),
    qa: z
      .object({
        lastCheckedAt: z.string().optional(),
        warnings: z.array(DocumentWarningSchema),
      })
      .optional(),
  })
}

export interface AuthoredDocumentState<TContent> {
  version: number
  mode: string
  updatedAt: string
  content: TContent
  viewPreferences?: DocumentViewPreferences
  qa?: {
    lastCheckedAt?: string
    warnings: DocumentWarning[]
  }
}

export const ProjectDocumentsSchema = z.object({
  synopsis: AuthoredDocumentStateSchema(SynopsisDocumentContentSchema),
  outline: AuthoredDocumentStateSchema(OutlineDocumentContentSchema),
  treatment: AuthoredDocumentStateSchema(TreatmentDocumentContentSchema),
  storyBible: AuthoredDocumentStateSchema(StoryBibleDocumentContentSchema),
})

export interface ProjectDocuments {
  synopsis: AuthoredDocumentState<SynopsisDocumentContent>
  outline: AuthoredDocumentState<OutlineDocumentContent>
  treatment: AuthoredDocumentState<TreatmentDocumentContent>
  storyBible: AuthoredDocumentState<StoryBibleDocumentContent>
}

export const DOCUMENT_SCHEMA_VERSION = 1

export function createEmptyDocuments(now: () => string = () => new Date().toISOString()): ProjectDocuments {
  const ts = now()

  return {
    synopsis: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'prose',
      updatedAt: ts,
      content: createEmptySynopsisContent(),
    },
    outline: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'beat_sheet_save_the_cat',
      updatedAt: ts,
      content: createEmptyOutlineContent(),
    },
    treatment: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'three_act_prose',
      updatedAt: ts,
      content: createEmptyTreatmentContent(),
    },
    storyBible: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'development',
      updatedAt: ts,
      content: createEmptyStoryBibleContent(),
    },
  }
}
