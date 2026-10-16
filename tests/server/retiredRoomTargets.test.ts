import { expect, it, vi } from 'vitest'

const { insertProposal } = vi.hoisted(() => ({ insertProposal: vi.fn() }))
vi.mock('../../server/room/store', () => ({ insertProposal }))
import { makeRoomToolset } from '../../server/room/roomToolset'
import { newRecorder } from '../../server/room/types'
import { canApplyProposal } from '../../client/src/lib/roomProposals'

it('refuses retired Room writes and pending retired proposals', async () => {
  const toolset = makeRoomToolset({ projectId: 'neutral-project', agentId: 'casey', recorder: newRecorder(), locksText: '', channelAuthors: new Set(['writer']) })
  for (const surface of ['synopsis', 'treatment']) {
    const result = await toolset.dispatchTool({ id: 'proposal', name: 'propose_field_write', input: { surface, fieldPath: 'logline.text', value: 'A courier returns home.', rationale: 'Clarify the goal.' } }, {} as never)
    expect(result).toMatchObject({ kind: 'error', content: 'This page is now written by Morgan' })
    expect(canApplyProposal(surface, 'logline.text')).toBe(false)
  }
  expect(insertProposal).not.toHaveBeenCalled()
})
