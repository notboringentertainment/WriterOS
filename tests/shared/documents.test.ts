import { describe, it, expect } from 'vitest'
import {
  SynopsisDocumentContentSchema,
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
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
