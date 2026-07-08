import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storeMock, sendStreamingMessageMock } = vi.hoisted(() => ({
  storeMock: {
    getPrivateBlocks: vi.fn(),
    listRecentMessages: vi.fn(),
    writeBlock: vi.fn(),
    insertMessage: vi.fn(),
    insertLedger: vi.fn(),
  },
  sendStreamingMessageMock: vi.fn(),
}))

vi.mock('../../../server/room/store', () => storeMock)
vi.mock('../../../server/room/sseHub', () => ({ broadcast: vi.fn() }))
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', () => ({
  sendStreamingMessage: (input: unknown) => sendStreamingMessageMock(input),
}))

import { runCaseyDigest } from '../../../server/room/digest'
import type { RoomEventRow } from '../../../server/room/types'

const event: RoomEventRow = {
  id: 'evt-digest',
  project_id: 'p1',
  kind: 'idle_tick',
  payload: {},
  processed_at: null,
  created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  storeMock.insertLedger.mockResolvedValue(undefined)
})

describe('runCaseyDigest', () => {
  it('ledgers errored when context reads fail before model call', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    storeMock.getPrivateBlocks.mockRejectedValueOnce(new Error('db down'))
    storeMock.listRecentMessages.mockResolvedValueOnce([])

    await runCaseyDigest({ projectId: 'p1', event })

    expect(sendStreamingMessageMock).not.toHaveBeenCalled()
    expect(storeMock.insertLedger).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', agentId: 'casey', action: 'errored', triggerEvent: 'evt-digest' }),
    )
    consoleSpy.mockRestore()
  })
})
