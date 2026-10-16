import type { MemoryGroundedPatchProposal } from '@shared/memoryPatches'
import type { PageProposal } from '@shared/morganLive'

export function toPatchProposal(p: Extract<PageProposal, { surface: 'outline' | 'storyBible' }>, current: unknown): MemoryGroundedPatchProposal {
  const changedPaths = Object.keys(p.content as object).filter(k =>
    JSON.stringify((p.content as Record<string, unknown>)[k]) !== JSON.stringify((current as Record<string, unknown> | null)?.[k]))
  return {
    patch: { kind: 'structured-document', surface: p.surface, baseVersion: p.baseRevision, proposedContent: p.content, changedPaths, memoryIds: [] },
    rationale: p.summary,
    canonConflicts: [],
    citations: [],
  }
}
