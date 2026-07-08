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
  it('uses the same caps in prompt, truncation, and writeBlock charCap', async () => {
    storeMock.getPrivateBlocks.mockResolvedValueOnce([])
    storeMock.listRecentMessages.mockResolvedValueOnce([])
    storeMock.writeBlock.mockResolvedValue({ ok: true, nearCap: false })
    sendStreamingMessageMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          lane_notes: 'l'.repeat(3600),
          writer_rapport: 'r'.repeat(1300),
          flag: null,
        }),
      }],
      usage: { input_tokens: 1, output_tokens: 2 },
    })

    await runCaseyDigest({ projectId: 'p1', event })

    const prompt = String(sendStreamingMessageMock.mock.calls[0][0].system)
    expect(prompt).toContain('lane_notes max 3400 chars')
    expect(prompt).toContain('writer_rapport max 1200 chars')
    expect(storeMock.writeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'lane_notes', value: 'l'.repeat(3400), charCap: 3400 }),
    )
    expect(storeMock.writeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'writer_rapport', value: 'r'.repeat(1200), charCap: 1200 }),
    )
  })

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
