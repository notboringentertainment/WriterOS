import { expect, it } from 'vitest'
import { MemoryGroundedPatchProposalSchema } from '@shared/memoryPatches'
import { toPatchProposal } from '../../client/src/lib/morganProposal'

it('converts structured proposals using the existing schema and differing top-level fields', () => {
  const p = toPatchProposal({ surface: 'outline', summary: 'Tighten the outline', baseRevision: 7, content: { same: { text: 'same' }, changed: ['after'], added: '' } }, { same: { text: 'same' }, changed: ['before'] })
  expect(p.patch.changedPaths).toEqual(['changed', 'added'])
  expect(p.patch.baseVersion).toBe(7)
  expect(p.rationale).toBe('Tighten the outline')
  expect(MemoryGroundedPatchProposalSchema.safeParse(p).success).toBe(true)
})
