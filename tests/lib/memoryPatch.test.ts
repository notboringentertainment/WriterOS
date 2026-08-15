import { describe, it, expect, vi } from 'vitest'
import {
  createEmptyDocuments,
  type OutlineDocumentContent,
  type StoryBibleDocumentContent,
  type SynopsisDocumentContent,
  type TreatmentDocumentContent,
} from '@shared/documents'
import {
  filterMemoryGroundedPatchProposal,
  validateMemoryGroundedPatch,
  type MemoryGroundedPatch,
  type MemoryGroundedPatchProposal,
} from '@shared/memoryPatches'
import type { MemorySource } from '@shared/projectMemory'
import {
  applyMemoryGroundedPatch,
  parsePatchProposal,
  shouldRequestDocumentPatch,
  surfaceForActiveTab,
} from '../../client/src/lib/memoryPatch'

function makeSetters() {
  return {
    synopsis: vi.fn<(updater: (content: SynopsisDocumentContent) => SynopsisDocumentContent) => void>(),
    outline: vi.fn<(updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void>(),
    treatment: vi.fn<(updater: (content: TreatmentDocumentContent) => TreatmentDocumentContent) => void>(),
    storyBible: vi.fn<(updater: (content: StoryBibleDocumentContent) => StoryBibleDocumentContent) => void>(),
  }
}

function makeSynopsisPatch(overrides: Partial<MemoryGroundedPatch> = {}): MemoryGroundedPatch {
  const proposedContent: SynopsisDocumentContent = {
    header: { title: 'A Quiet Harbor', writer: 'W. Author', format: 'feature', genre: 'drama', targetRuntime: '95m', comps: [] },
    logline: { text: 'A lighthouse keeper confronts a stranger.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' },
    prose: { opening: 'Opening.', escalation: 'Escalation.', middle: 'Middle.', climax: 'Climax.', resolution: 'Resolution.' },
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
  }
  return {
    kind: 'structured-document',
    surface: 'synopsis',
    baseVersion: 0,
    proposedContent,
    changedPaths: ['logline.text', 'prose.opening'],
    memoryIds: ['[M-ABCD-1234]'],
    ...overrides,
  }
}

describe('shouldRequestDocumentPatch', () => {
  it('returns true for fill/rewrite/apply/revise requests', () => {
    expect(shouldRequestDocumentPatch('Can you fill in the synopsis for me?')).toBe(true)
    expect(shouldRequestDocumentPatch('Please rewrite the opening paragraph.')).toBe(true)
    expect(shouldRequestDocumentPatch('re-write this section')).toBe(true)
    expect(shouldRequestDocumentPatch('Apply the notes from our last session.')).toBe(true)
    expect(shouldRequestDocumentPatch('Revise the logline to raise the stakes.')).toBe(true)
  })

  it('returns false for messages that never ask for a fill/rewrite/apply/revise', () => {
    expect(shouldRequestDocumentPatch('What do you think of this scene?')).toBe(false)
    expect(shouldRequestDocumentPatch('Tell me about the protagonist.')).toBe(false)
    expect(shouldRequestDocumentPatch('')).toBe(false)
  })
})

describe('surfaceForActiveTab', () => {
  it('maps writing tabs to their structured-document surface', () => {
    expect(surfaceForActiveTab('synopsis')).toBe('synopsis')
    expect(surfaceForActiveTab('outline')).toBe('outline')
    expect(surfaceForActiveTab('treatment')).toBe('treatment')
    expect(surfaceForActiveTab('story-bible')).toBe('storyBible')
  })

  it('returns undefined for tabs with no structured-document surface', () => {
    expect(surfaceForActiveTab('script')).toBeUndefined()
    expect(surfaceForActiveTab('something-unknown')).toBeUndefined()
  })
})

describe('parsePatchProposal', () => {
  const validProposal = {
    patch: makeSynopsisPatch(),
    rationale: 'Tightens the opening to match the agreed logline.',
    canonConflicts: [],
    citations: [{ id: '[M-ABCD-1234]', workflow: 'writeros' as const, sourceUri: 'writeros://project/1' }],
  }

  it('parses a well-formed proposal', () => {
    const result = parsePatchProposal(validProposal)
    expect(result).toBeDefined()
    expect(result?.patch.surface).toBe('synopsis')
    expect(result?.rationale).toBe(validProposal.rationale)
    expect(result?.citations).toHaveLength(1)
  })

  it('returns undefined for a missing/undefined value', () => {
    expect(parsePatchProposal(undefined)).toBeUndefined()
    expect(parsePatchProposal(null)).toBeUndefined()
  })

  it('returns undefined when the patch kind is not structured-document', () => {
    const bad = { ...validProposal, patch: { ...validProposal.patch, kind: 'script-selection' } }
    expect(parsePatchProposal(bad)).toBeUndefined()
  })

  it('returns undefined when the surface is unrecognized', () => {
    const bad = { ...validProposal, patch: { ...validProposal.patch, surface: 'script' } }
    expect(parsePatchProposal(bad)).toBeUndefined()
  })

  it('returns undefined when proposedContent fails the surface schema', () => {
    const bad = { ...validProposal, patch: { ...validProposal.patch, proposedContent: { not: 'a synopsis' } } }
    expect(parsePatchProposal(bad)).toBeUndefined()
  })

  it('returns undefined when required proposal fields are missing', () => {
    const { rationale: _rationale, ...missingRationale } = validProposal
    expect(parsePatchProposal(missingRationale)).toBeUndefined()
  })
})

describe('validateMemoryGroundedPatch', () => {
  it('accepts a patch whose proposedContent matches its surface schema', () => {
    const result = validateMemoryGroundedPatch(makeSynopsisPatch())
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed shape (e.g. wrong kind)', () => {
    const result = validateMemoryGroundedPatch({ ...makeSynopsisPatch(), kind: 'script-selection' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBe('invalid-shape')
  })

  it('rejects content that fails the exact surface schema', () => {
    const result = validateMemoryGroundedPatch(makeSynopsisPatch({ proposedContent: { not: 'a synopsis' } }))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBe('invalid-content')
  })
})

describe('filterMemoryGroundedPatchProposal', () => {
  function makeSource(overrides: Partial<MemorySource> = {}): MemorySource {
    return {
      workflow: 'writeros',
      sourceId: 'source-1',
      sourceUri: 'writeros://project/1',
      ...overrides,
    } as MemorySource
  }

  it('drops memoryIds the supplied context does not vouch for and rebuilds citations to match', () => {
    const proposal: MemoryGroundedPatchProposal = {
      patch: makeSynopsisPatch({ memoryIds: ['[M-REAL-0001]', '[M-INVENTED-9999]'] }),
      rationale: 'R',
      canonConflicts: [],
      citations: [
        { id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' },
        { id: '[M-INVENTED-9999]', workflow: 'writeros', sourceUri: 'writeros://project/9' },
      ],
    }
    const allowedCitations = new Map([['[M-REAL-0001]', makeSource()]])

    const filtered = filterMemoryGroundedPatchProposal(proposal, allowedCitations)

    expect(filtered.patch.memoryIds).toEqual(['[M-REAL-0001]'])
    expect(filtered.citations).toEqual([{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }])
  })

  it('keeps every memoryId that is vouched for', () => {
    const proposal: MemoryGroundedPatchProposal = {
      patch: makeSynopsisPatch({ memoryIds: ['[M-REAL-0001]'] }),
      rationale: 'R',
      canonConflicts: [],
      citations: [{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }],
    }
    const allowedCitations = new Map([['[M-REAL-0001]', makeSource()]])

    const filtered = filterMemoryGroundedPatchProposal(proposal, allowedCitations)

    expect(filtered.patch.memoryIds).toEqual(['[M-REAL-0001]'])
  })
})

describe('applyMemoryGroundedPatch', () => {
  it('applies through the matching setter exactly once when the patch is current', () => {
    const documents = createEmptyDocuments(() => '2026-08-01T00:00:00.000Z')
    const patch = makeSynopsisPatch({ baseVersion: documents.synopsis.revision })
    const setters = makeSetters()

    const result = applyMemoryGroundedPatch(patch, documents, setters)

    expect(result).toEqual({ ok: true })
    expect(setters.synopsis).toHaveBeenCalledTimes(1)
    expect(setters.outline).not.toHaveBeenCalled()
    expect(setters.treatment).not.toHaveBeenCalled()
    expect(setters.storyBible).not.toHaveBeenCalled()

    const updater = setters.synopsis.mock.calls[0][0] as (c: SynopsisDocumentContent) => SynopsisDocumentContent
    expect(updater(documents.synopsis.content)).toEqual(patch.proposedContent)
  })

  it('rejects a stale patch without calling any setter', () => {
    const documents = createEmptyDocuments(() => '2026-08-01T00:00:00.000Z')
    const staleDocuments = { ...documents, synopsis: { ...documents.synopsis, revision: documents.synopsis.revision + 1 } }
    const patch = makeSynopsisPatch({ baseVersion: documents.synopsis.revision })
    const setters = makeSetters()

    const result = applyMemoryGroundedPatch(patch, staleDocuments, setters)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('stale')
    expect(setters.synopsis).not.toHaveBeenCalled()
  })

  it('rejects invalid proposed content without calling any setter', () => {
    const documents = createEmptyDocuments(() => '2026-08-01T00:00:00.000Z')
    const patch = makeSynopsisPatch({
      baseVersion: documents.synopsis.revision,
      proposedContent: { not: 'a synopsis' },
    })
    const setters = makeSetters()

    const result = applyMemoryGroundedPatch(patch, documents, setters)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('invalid')
    expect(setters.synopsis).not.toHaveBeenCalled()
  })

  it('routes an outline patch through the outline setter only', () => {
    const documents = createEmptyDocuments(() => '2026-08-01T00:00:00.000Z')
    const patch: MemoryGroundedPatch = {
      kind: 'structured-document',
      surface: 'outline',
      baseVersion: documents.outline.revision,
      proposedContent: documents.outline.content,
      changedPaths: ['spine.protagonist'],
      memoryIds: [],
    }
    const setters = makeSetters()

    const result = applyMemoryGroundedPatch(patch, documents, setters)

    expect(result).toEqual({ ok: true })
    expect(setters.outline).toHaveBeenCalledTimes(1)
    expect(setters.synopsis).not.toHaveBeenCalled()
  })
})
