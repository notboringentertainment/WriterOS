import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storeMock, sendStreamingMessageMock } = vi.hoisted(() => ({
  storeMock: {
    getPrivateBlocks: vi.fn(),
    getSharedBlocksForAgent: vi.fn(),
    listRecentMessages: vi.fn(),
    writeBlock: vi.fn(),
    insertMessage: vi.fn(),
    insertLedger: vi.fn(),
  },
  sendStreamingMessageMock: vi.fn(),
}))

vi.mock('../../../server/room/store', () => storeMock)
vi.mock('../../../server/room/sseHub', () => ({ broadcast: vi.fn() }))
const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }))
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()), ensureProjectMemory: memoryMock.ensureProjectMemory,
}))
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', () => ({
  sendStreamingMessage: (input: unknown) => sendStreamingMessageMock(input),
}))

import { runCaseyDigest } from '../../../server/room/digest'
import type { RoomEventRow } from '../../../server/room/types'
import { RoomMemoryError } from '../../../server/room/memoryContract'

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
  storeMock.getSharedBlocksForAgent.mockResolvedValue([])
})

describe('runCaseyDigest', () => {
  it('grounds scheduled digest work and attaches the exact receipt to a surfaced flag', async () => {
    const memoryProvider = {
      context: vi.fn().mockResolvedValue({
        projectId: 'p1', revision: 29, activeCanon: [], relevant: [], conflicts: [],
        spoilerConflictIds: [], citationMap: {},
      }),
    }
    storeMock.getPrivateBlocks.mockResolvedValue([])
    storeMock.listRecentMessages.mockResolvedValue([])
    storeMock.writeBlock.mockResolvedValue({ ok: true, nearCap: false })
    sendStreamingMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"lane_notes":"Remember the continuity risk.","flag":"A continuity risk."}' }],
    })
    storeMock.insertMessage.mockResolvedValue({ id: 'm1' })

    await runCaseyDigest({ projectId: 'p1', event, memoryProvider })

    expect(memoryProvider.context).toHaveBeenCalledTimes(1)
    expect(sendStreamingMessageMock.mock.calls[0][0].system).toContain('<project_memory_data>')
    expect(storeMock.insertMessage).toHaveBeenCalledWith(expect.objectContaining({
      memoryReceipt: expect.objectContaining({ revision: 29, status: 'available' }),
    }))
    expect(storeMock.writeBlock).toHaveBeenCalledWith(expect.objectContaining({
      label: 'lane_notes',
      memoryReceipt: expect.objectContaining({ revision: 29, status: 'available' }),
    }))
  })

  it('fails closed before scheduled digest model execution when folder memory is unavailable', async () => {
    const memoryProvider = { context: vi.fn().mockRejectedValue(new Error('/private/ledger corrupt')) }
    await expect(runCaseyDigest({ projectId: 'p1', event, memoryProvider }))
      .rejects.toBeInstanceOf(RoomMemoryError)
    expect(sendStreamingMessageMock).not.toHaveBeenCalled()
  })

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

  it('caps raw digest fields before citation finalization and never persists a citation crossing the cap', async () => {
    const citation = '[M-64E3-00760069007300690062006C0065]'
    const source = {
      workflow: 'writeros' as const, sourceId: 'document:story-bible',
      sourceUri: 'writeros://documents/story-bible#harbor', sourceHash: 'sha256:source',
      capturedAt: '2026-08-14T12:00:00.000Z', approval: 'explicit' as const,
    }
    const record = {
      id: 'visible', projectId: 'p1', kind: 'canon' as const, status: 'active' as const,
      claim: 'The harbor closes at midnight.', tags: [], entities: [], source,
      evidence: [], safety: 'clear' as const, spoiler: false, supersedes: [],
      createdAt: '2026-08-14T12:00:00.000Z', updatedAt: '2026-08-14T12:00:00.000Z',
    }
    const memoryProvider = { context: vi.fn().mockResolvedValue({
      projectId: 'p1', revision: 31, activeCanon: [record], relevant: [], conflicts: [],
      spoilerConflictIds: [], citationMap: { [citation]: source },
    }) }
    storeMock.getPrivateBlocks.mockResolvedValue([])
    storeMock.listRecentMessages.mockResolvedValue([])
    storeMock.writeBlock.mockResolvedValue({ ok: true, nearCap: false })
    sendStreamingMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        // This citation begins before the cap but is cut in half by it.
        lane_notes: `${'l'.repeat(3396)} ${citation}`,
        // This valid citation is wholly beyond the cap.
        writer_rapport: `${'r'.repeat(1200)} ${citation}`,
        flag: null,
      }) }],
    })

    await runCaseyDigest({ projectId: 'p1', event, memoryProvider })

    expect(storeMock.writeBlock).toHaveBeenCalledWith(expect.objectContaining({
      label: 'lane_notes', value: `${'l'.repeat(3396)} `,
      memoryReceipt: expect.objectContaining({ revision: 31, citations: [] }),
    }))
    expect(storeMock.writeBlock).toHaveBeenCalledWith(expect.objectContaining({
      label: 'writer_rapport', value: 'r'.repeat(1200),
      memoryReceipt: expect.objectContaining({ revision: 31, citations: [] }),
    }))
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

  it('guards model execution and includes shared memory', async () => {
    storeMock.getPrivateBlocks.mockResolvedValue([])
    storeMock.getSharedBlocksForAgent.mockResolvedValue([
      { label: 'concept_seed', value: 'Banked founding seed' },
      { label: 'story_locks', value: '[SEED] ending fixed' },
    ])
    storeMock.listRecentMessages.mockResolvedValue([])
    sendStreamingMessageMock.mockResolvedValue({ content: [{ type: 'text', text: '{"flag":null}' }] })
    await runCaseyDigest({ projectId: 'p1', event })
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1')
    const content = String(sendStreamingMessageMock.mock.calls[0][0].messages[0].content)
    expect(content).toContain('Banked founding seed')
    expect(content).toContain('[SEED] ending fixed')
  })
})
