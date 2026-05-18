import { describe, it, expect } from 'vitest'
import {
  SynopsisDocumentContentSchema,
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
  OutlineDocumentContentSchema,
  type OutlineDocumentContent,
  createEmptyOutlineContent,
  TreatmentDocumentContentSchema,
  type TreatmentDocumentContent,
  createEmptyTreatmentContent,
  StoryBibleDocumentContentSchema,
  type StoryBibleDocumentContent,
  createEmptyStoryBibleContent,
  AuthoredDocumentStateSchema,
  ProjectDocumentsSchema,
  createEmptyDocuments,
  type ProjectDocuments,
  DocumentViewPreferencesSchema,
  SynopsisSeriesContentSchema,
  SynopsisSeriesTypeSchema,
  SynopsisEpisodeLengthSchema,
  SynopsisFutureSeasonSchema,
  SynopsisSeriesCharacterSchema,
  createEmptySeriesContent,
  type SynopsisSeriesContent,
} from '../../shared/documents'

describe('SynopsisDocumentContent', () => {
  it('createEmptySynopsisContent returns a Zod-valid empty content object', () => {
    const empty = createEmptySynopsisContent()
    const result = SynopsisDocumentContentSchema.safeParse(empty)
    expect(result.success).toBe(true)
  })

  it('accepts a populated content object', () => {
    const populated: SynopsisDocumentContent = {
      header: {
        title: 'My Film',
        writer: 'Ben',
        format: 'feature',
        genre: 'drama',
        targetRuntime: '100m',
        comps: ['Heat', 'Manchester by the Sea'],
      },
      logline: {
        text: 'A widowed firefighter...',
        protagonist: 'Sara',
        goal: 'find her son',
        obstacle: 'a corrupt city',
        stakes: 'the boy dies',
        hook: 'told in reverse',
      },
      prose: {
        opening: 'A',
        escalation: 'B',
        middle: 'C',
        climax: 'D',
        resolution: 'E',
      },
      qa: {
        protagonistNamedEarly: true,
        goalClear: true,
        obstacleClear: true,
        stakesClear: true,
        endingRevealed: true,
        paragraphsConnectCausally: true,
        toneMatchesProject: true,
        noUnnecessarySubplot: true,
      },
      aiProductionImplications: {
        visuallyImportantSequences: 'climax fire',
        continuitySensitiveMoments: 'sister reveal',
        difficultWorldOrVfx: 'wall of fire',
        likelyReferenceImageNeeds: 'firehouse interior',
      },
    }
    const result = SynopsisDocumentContentSchema.safeParse(populated)
    expect(result.success).toBe(true)
  })

  it('rejects content with wrong types', () => {
    const broken = { header: { title: 123 }, logline: {}, prose: {}, qa: {} }
    const result = SynopsisDocumentContentSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })
})

describe('OutlineDocumentContent', () => {
  it('createEmptyOutlineContent returns a Zod-valid empty content object', () => {
    const empty = createEmptyOutlineContent()
    const result = OutlineDocumentContentSchema.safeParse(empty)
    expect(result.success).toBe(true)
  })

  it('createEmptyOutlineContent defaults mode to beat_sheet_save_the_cat', () => {
    expect(createEmptyOutlineContent().mode).toBe('beat_sheet_save_the_cat')
  })

  it('accepts a populated outline with units', () => {
    const populated: OutlineDocumentContent = {
      mode: 'scene_by_scene',
      structureModel: 'three_act',
      spine: {
        protagonist: 'Sara',
        externalGoal: 'find her son',
        internalNeed: 'forgive herself',
        centralOpposition: 'the city',
        coreStakes: 'the boy dies',
        theme: 'mercy under pressure',
        ending: 'she lets go',
      },
      units: [
        {
          id: 'u1',
          number: 1,
          actOrSequence: 'Act 1',
          title: 'Opening',
          location: 'Firehouse',
          characters: ['Sara'],
          whatHappens: 'Sara is paged.',
          conflict: 'She is hung over.',
          turn: 'She goes anyway.',
          consequence: 'She finds the note.',
          whyNext: 'The note names the son.',
          linkedSceneIds: ['scene-1'],
          draftNotes: '',
        },
      ],
      aiProductionColumns: {
        enabled: false,
      },
    }
    const result = OutlineDocumentContentSchema.safeParse(populated)
    expect(result.success).toBe(true)
  })

  it('rejects an outline with unknown mode', () => {
    const broken = { ...createEmptyOutlineContent(), mode: 'not_a_real_mode' }
    expect(OutlineDocumentContentSchema.safeParse(broken).success).toBe(false)
  })
})

describe('TreatmentDocumentContent', () => {
  it('createEmptyTreatmentContent returns a Zod-valid empty content object', () => {
    const empty = createEmptyTreatmentContent()
    expect(TreatmentDocumentContentSchema.safeParse(empty).success).toBe(true)
  })

  it('accepts a populated treatment', () => {
    const populated: TreatmentDocumentContent = {
      header: { title: 'X', writer: 'Y', format: 'feature', genre: 'drama', version: '1', date: '2026-05-15' },
      logline: 'A widow returns home.',
      concept: { premise: 'p', tone: 't', theme: 'th', emotionalPromise: 'e' },
      mainCharacters: [
        {
          id: 'c1',
          name: 'Sara',
          role: 'Protagonist',
          externalWant: 'home',
          internalNeed: 'forgiveness',
          flawOrWound: 'guilt',
          secretOrContradiction: 'killed her sister',
          arc: 'guilt -> mercy',
          relationshipPressure: 'distant father',
        },
      ],
      prose: { opening: 'a', actOne: 'b', actTwo: 'c', actThree: 'd', customSections: [] },
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
    expect(TreatmentDocumentContentSchema.safeParse(populated).success).toBe(true)
  })
})

describe('StoryBibleDocumentContent', () => {
  it('createEmptyStoryBibleContent returns a Zod-valid empty content object', () => {
    expect(StoryBibleDocumentContentSchema.safeParse(createEmptyStoryBibleContent()).success).toBe(true)
  })

  it('accepts a populated story bible with one character', () => {
    const populated: StoryBibleDocumentContent = {
      cover: {
        title: 't',
        writer: 'w',
        format: 'feature',
        genre: 'drama',
        version: '1',
        dateUpdated: '2026-05-15',
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
      characters: [
        {
          id: 'c1',
          name: 'Sara',
          role: 'Protagonist',
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
        },
      ],
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
    expect(StoryBibleDocumentContentSchema.safeParse(populated).success).toBe(true)
  })
})

describe('AuthoredDocumentState wrapper', () => {
  it('createEmptyDocuments returns a Zod-valid ProjectDocuments', () => {
    const empty = createEmptyDocuments()
    expect(ProjectDocumentsSchema.safeParse(empty).success).toBe(true)
  })

  it('each surface wrapper has version 1 and an updatedAt ISO string', () => {
    const empty = createEmptyDocuments()
    for (const surface of ['synopsis', 'outline', 'treatment', 'storyBible'] as const) {
      expect(empty[surface].version).toBe(1)
      expect(typeof empty[surface].updatedAt).toBe('string')
      expect(empty[surface].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('viewPreferences.activeView accepts edit or document', () => {
    const empty = createEmptyDocuments()
    const docs: ProjectDocuments = {
      ...empty,
      synopsis: { ...empty.synopsis, viewPreferences: { activeView: 'document' } },
    }
    expect(ProjectDocumentsSchema.safeParse(docs).success).toBe(true)
  })

  it('AuthoredDocumentState rejects negative version', () => {
    const empty = createEmptyDocuments()
    const bad = { ...empty.synopsis, version: -1 }
    expect(AuthoredDocumentStateSchema(SynopsisDocumentContentSchema).safeParse(bad).success).toBe(false)
  })
})

describe('DocumentViewPreferencesSchema — synopsisComposeMode', () => {
  it('accepts prose mode', () => {
    const result = DocumentViewPreferencesSchema.safeParse({ synopsisComposeMode: 'prose' })
    expect(result.success).toBe(true)
  })

  it('accepts paragraphs mode', () => {
    const result = DocumentViewPreferencesSchema.safeParse({ synopsisComposeMode: 'paragraphs' })
    expect(result.success).toBe(true)
  })

  it('still accepts an object with no synopsisComposeMode (backward compatible)', () => {
    const result = DocumentViewPreferencesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('still accepts an object with only activeView set (backward compatible)', () => {
    const result = DocumentViewPreferencesSchema.safeParse({ activeView: 'edit' })
    expect(result.success).toBe(true)
  })

  it('accepts Story Bible migration and expansion preferences', () => {
    const result = DocumentViewPreferencesSchema.safeParse({
      migratedFromLegacyStoryBible: true,
      expandedStoryBibleCharacterIds: ['c1'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown synopsisComposeMode value', () => {
    const result = DocumentViewPreferencesSchema.safeParse({ synopsisComposeMode: 'outline' })
    expect(result.success).toBe(false)
  })
})

describe('SynopsisSeriesContent', () => {
  it('createEmptySeriesContent returns a Zod-valid empty content object', () => {
    const empty = createEmptySeriesContent()
    expect(SynopsisSeriesContentSchema.safeParse(empty).success).toBe(true)
  })

  it('createEmptySeriesContent defaults seriesType to ongoing', () => {
    expect(createEmptySeriesContent().seriesType).toBe('ongoing')
  })

  it('createEmptySeriesContent defaults episodeLength to hour', () => {
    expect(createEmptySeriesContent().episodeLength).toBe('hour')
  })

  it('createEmptySeriesContent has empty futureSeasons and characters arrays', () => {
    const empty = createEmptySeriesContent()
    expect(empty.futureSeasons).toEqual([])
    expect(empty.characters).toEqual([])
  })

  it('accepts a populated series content object', () => {
    const populated: SynopsisSeriesContent = {
      seriesType: 'limited',
      episodeLength: 'half_hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: { logline: 'P', prose: 'PROSE' },
      seasonOneArc: 'Arc text.',
      futureSeasons: [
        { id: 's1', label: 'Season 2', summary: 'Two sentences.' },
        { id: 's2', label: 'Season 3', summary: 'Two sentences.' },
      ],
      characters: [
        {
          id: 'c1',
          name: 'Sara',
          role: 'Protagonist',
          bio: 'Short bio.',
          arcPerSeason: ['Season 1: guilt -> mercy', 'Season 2: mercy tested'],
        },
      ],
      compsAndWhyThisShowNow: 'Like X meets Y.',
    }
    expect(SynopsisSeriesContentSchema.safeParse(populated).success).toBe(true)
  })

  it('rejects bad seriesType', () => {
    const bad = { ...createEmptySeriesContent(), seriesType: 'mini' as any }
    expect(SynopsisSeriesContentSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects bad episodeLength', () => {
    const bad = { ...createEmptySeriesContent(), episodeLength: 'two_hour' as any }
    expect(SynopsisSeriesContentSchema.safeParse(bad).success).toBe(false)
  })

  it('SynopsisSeriesTypeSchema accepts limited and ongoing', () => {
    expect(SynopsisSeriesTypeSchema.safeParse('limited').success).toBe(true)
    expect(SynopsisSeriesTypeSchema.safeParse('ongoing').success).toBe(true)
    expect(SynopsisSeriesTypeSchema.safeParse('mini').success).toBe(false)
  })

  it('SynopsisEpisodeLengthSchema accepts half_hour, hour, other', () => {
    expect(SynopsisEpisodeLengthSchema.safeParse('half_hour').success).toBe(true)
    expect(SynopsisEpisodeLengthSchema.safeParse('hour').success).toBe(true)
    expect(SynopsisEpisodeLengthSchema.safeParse('other').success).toBe(true)
    expect(SynopsisEpisodeLengthSchema.safeParse('feature').success).toBe(false)
  })

  it('SynopsisFutureSeasonSchema requires id, label, summary as strings', () => {
    expect(SynopsisFutureSeasonSchema.safeParse({ id: 'x', label: 'L', summary: 'S' }).success).toBe(true)
    expect(SynopsisFutureSeasonSchema.safeParse({ id: 'x', label: 'L' }).success).toBe(false)
  })

  it('SynopsisSeriesCharacterSchema requires arcPerSeason array', () => {
    const valid = { id: 'c1', name: 'N', role: 'R', bio: 'B', arcPerSeason: [] }
    expect(SynopsisSeriesCharacterSchema.safeParse(valid).success).toBe(true)
    const bad = { id: 'c1', name: 'N', role: 'R', bio: 'B' }
    expect(SynopsisSeriesCharacterSchema.safeParse(bad).success).toBe(false)
  })
})

describe('SynopsisDocumentContent — optional series field', () => {
  it('SynopsisDocumentContent without series is still Zod-valid', () => {
    const content = createEmptySynopsisContent()
    expect(SynopsisDocumentContentSchema.safeParse(content).success).toBe(true)
  })

  it('SynopsisDocumentContent with populated series is Zod-valid', () => {
    const content = { ...createEmptySynopsisContent(), series: createEmptySeriesContent() }
    expect(SynopsisDocumentContentSchema.safeParse(content).success).toBe(true)
  })

  it('SynopsisDocumentContent with bad series content is rejected', () => {
    const content = {
      ...createEmptySynopsisContent(),
      series: { ...createEmptySeriesContent(), seriesType: 'mini' as any },
    }
    expect(SynopsisDocumentContentSchema.safeParse(content).success).toBe(false)
  })
})
