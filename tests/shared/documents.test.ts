import { describe, it, expect } from 'vitest'
import {
  SynopsisDocumentContentSchema,
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
  OutlineDocumentContentSchema,
  type OutlineDocumentContent,
  createEmptyOutlineContent,
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
