import { describe, it, expect, vi } from 'vitest'
import {
  createEmptyDocuments,
  type OutlineDocumentContent,
  type StoryBibleDocumentContent,
  type SynopsisDocumentContent,
  type TreatmentDocumentContent,
} from '@shared/documents'
import {
  diffChangedPaths,
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

function fixtureSynopsisContent(overrides: Partial<SynopsisDocumentContent> = {}): SynopsisDocumentContent {
  return {
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
    ...overrides,
  }
}

function makeSynopsisPatch(overrides: Partial<MemoryGroundedPatch> = {}): MemoryGroundedPatch {
  return {
    kind: 'structured-document',
    surface: 'synopsis',
    baseVersion: 0,
    proposedContent: fixtureSynopsisContent(),
    changedPaths: ['logline.text', 'prose.opening'],
    memoryIds: ['[M-ABCD-1234]'],
    ...overrides,
  }
}

describe('shouldRequestDocumentPatch', () => {
  it('returns true when a trigger verb names the current surface', () => {
    expect(shouldRequestDocumentPatch('Can you fill in the synopsis for me?', 'synopsis')).toBe(true)
    expect(shouldRequestDocumentPatch('Please rewrite the outline.', 'outline')).toBe(true)
    expect(shouldRequestDocumentPatch('re-write this treatment', 'treatment')).toBe(true)
    expect(shouldRequestDocumentPatch('Apply these notes to the story bible.', 'storyBible')).toBe(true)
    expect(shouldRequestDocumentPatch('Revise the logline in this synopsis to raise the stakes.', 'synopsis')).toBe(true)
  })

  it('returns true when a trigger verb uses generic this/current-document deixis', () => {
    expect(shouldRequestDocumentPatch('Please rewrite this document.', 'synopsis')).toBe(true)
    expect(shouldRequestDocumentPatch('Can you fill in the current document?', 'outline')).toBe(true)
    expect(shouldRequestDocumentPatch('Apply your notes to this doc.', 'treatment')).toBe(true)
  })

  it('returns false for messages that never ask for a fill/rewrite/apply/revise', () => {
    expect(shouldRequestDocumentPatch('What do you think of this scene?', 'synopsis')).toBe(false)
    expect(shouldRequestDocumentPatch('Tell me about the protagonist.', 'synopsis')).toBe(false)
    expect(shouldRequestDocumentPatch('', 'synopsis')).toBe(false)
  })

  // Review Important 2: the verb alone is not enough. Both false-positive
  // cases the review named, reproduced directly.
  it('returns false when the verb is present but the message has nothing to do with a document', () => {
    expect(shouldRequestDocumentPatch('Should I apply to that fellowship?', 'synopsis')).toBe(false)
    expect(shouldRequestDocumentPatch('Should I apply to that fellowship?', 'outline')).toBe(false)
  })

  it('returns false when the verb targets a different surface than the current one (cross-surface)', () => {
    // "Please rewrite this scene" on the Synopsis tab must not patch the
    // synopsis — "scene" names the script, not the current structured
    // surface, and is not document deixis.
    expect(shouldRequestDocumentPatch('Please rewrite this scene.', 'synopsis')).toBe(false)
    // Naming a DIFFERENT structured surface than the current one must also
    // not trigger — the writer is on Synopsis but asked about the outline.
    expect(shouldRequestDocumentPatch('Please rewrite the outline.', 'synopsis')).toBe(false)
    expect(shouldRequestDocumentPatch('Revise the treatment.', 'outline')).toBe(false)
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

describe('diffChangedPaths', () => {
  it('returns an empty list when nothing changed', () => {
    const content = fixtureSynopsisContent()
    expect(diffChangedPaths(content, fixtureSynopsisContent())).toEqual([])
  })

  it('reports a single changed leaf field with a dot-notation path', () => {
    const before = fixtureSynopsisContent()
    const after = fixtureSynopsisContent({
      logline: { ...before.logline, text: 'A new logline.' },
    })
    expect(diffChangedPaths(before, after)).toEqual(['logline.text'])
  })

  it('reports every changed field, sorted, when more than one changes', () => {
    const before = fixtureSynopsisContent()
    const after = fixtureSynopsisContent({
      logline: { ...before.logline, text: 'A new logline.' },
      prose: { ...before.prose, opening: 'A new opening.' },
    })
    expect(diffChangedPaths(before, after)).toEqual(['logline.text', 'prose.opening'])
  })

  it('reports array-item changes with a bracket-index path', () => {
    const before = { characters: [{ id: 'c1', arc: 'starts distrustful' }] }
    const after = { characters: [{ id: 'c1', arc: 'learns to trust the team' }] }
    expect(diffChangedPaths(before, after)).toEqual(['characters[0].arc'])
  })

  it('reports an added array item as its own changed path', () => {
    const before = { characters: [{ id: 'c1', arc: 'a' }] }
    const after = { characters: [{ id: 'c1', arc: 'a' }, { id: 'c2', arc: 'b' }] }
    expect(diffChangedPaths(before, after)).toEqual(['characters[1]'])
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
