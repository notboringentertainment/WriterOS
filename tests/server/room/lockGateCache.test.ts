import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendStreamingMessageMock } = vi.hoisted(() => ({
  sendStreamingMessageMock: vi.fn(),
}))

vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', () => ({
  sendStreamingMessage: (input: unknown) => sendStreamingMessageMock(input),
}))

import { __clearLockGateCacheForTests, checkProposalAgainstLocks } from '../../../server/room/lockGate'

beforeEach(() => {
  vi.clearAllMocks()
  __clearLockGateCacheForTests()
  sendStreamingMessageMock.mockResolvedValue({
    content: [{ type: 'text', text: '{"blocked": false, "reason": ""}' }],
  })
})

describe('checkProposalAgainstLocks cache', () => {
  it('does not reuse decisions across different proposal surfaces', async () => {
    const base = {
      locksText: '[global] keep the ending fixed',
      fieldPath: 'characters[r1].want',
      proposedValue: 'leave town',
    }

    await checkProposalAgainstLocks({ ...base, surface: 'storyBible' })
    await checkProposalAgainstLocks({ ...base, surface: 'outline' })
    await checkProposalAgainstLocks({ ...base, surface: 'outline' })

    expect(sendStreamingMessageMock).toHaveBeenCalledTimes(2)
  })
})
