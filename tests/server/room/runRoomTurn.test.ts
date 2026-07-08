import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storeMock, broadcastMock, sendToolTurnMock } = vi.hoisted(() => ({
  storeMock: {
    getSharedBlocksForAgent: vi.fn(),
    getPrivateBlocks: vi.fn(),
    listRecentMessages: vi.fn(),
    getSharedBlockValue: vi.fn(),
    insertMessage: vi.fn(),
    insertLedger: vi.fn(),
    insertProposal: vi.fn(),
    insertEvent: vi.fn(),
    writeBlock: vi.fn(),
  },
  broadcastMock: vi.fn(),
  // Mock the Anthropic client: scripted tool turns, no network.
  sendToolTurnMock: vi.fn(),
}))
vi.mock('../../../server/room/store', () => storeMock)
vi.mock('../../../server/room/sseHub', () => ({ broadcast: broadcastMock }))

vi.mock('../../../server/room/lockGate', () => ({
  checkProposalAgainstLocks: vi.fn().mockResolvedValue({ blocked: false }),
  DIGEST_MODEL: 'test-digest-model',
}))
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    isAnthropicConfigured: () => true,
    sendToolTurn: (input: unknown) => sendToolTurnMock(input),
  }
})

import { runRoomTurn } from '../../../server/room/runRoomTurn'
import type { RoomEventRow } from '../../../server/room/types'

const event: RoomEventRow = {
  id: 'evt-1',
  project_id: 'p1',
  kind: 'doc_field_changed',
  payload: { surface: 'storyBible', fieldPath: 'characters[r1].want', characterName: 'Rosa', oldValue: 'win the contest', newValue: 'win back the restaurant' },
  processed_at: null,
  created_at: new Date().toISOString(),
}

const writerMessageEvent: RoomEventRow = {
  id: 'evt-writer',
  project_id: 'p1',
  kind: 'writer_message',
  payload: {
    content: "Casey, help me figure out Rosa's want.",
    characterNames: ['Rosa'],
    characters: [{ id: 'r1', name: 'Rosa', want: '', need: 'accept help' }],
  },
  processed_at: null,
  created_at: new Date().toISOString(),
}

const toolTurn = (uses: Array<{ id: string; name: string; input: unknown }>, text = '') => ({
  stopReason: 'tool_use',
  toolUses: uses,
  text,
  assistantContent: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  storeMock.getSharedBlocksForAgent.mockResolvedValue([])
  storeMock.getPrivateBlocks.mockResolvedValue([
    {
      id: 'b1', project_id: 'p1', agent_id: 'casey', label: 'lane_notes',
      value: 'Last session: Rosa want/need tension.', char_cap: 4000, updated_by: 'casey', updated_at: '',
    },
  ])
  storeMock.listRecentMessages.mockResolvedValue([
    { id: 'm0', project_id: 'p1', author: 'writer', kind: 'say', content: 'Rosa is the lead.', reply_to: null, created_at: '' },
  ])
  storeMock.getSharedBlockValue.mockResolvedValue('')
  storeMock.insertMessage.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 'msg-new', project_id: input.projectId, author: input.author, kind: input.kind ?? 'say',
    content: input.content, reply_to: null, created_at: '',
  }))
  storeMock.insertLedger.mockResolvedValue(undefined)
})

describe('runRoomTurn', () => {
  it('speak turn: streams, inserts the message post-guard, ledgers as spoke', async () => {
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([{ id: 'u1', name: 'speak', input: { content: 'That want shift changes her arc math.' } }]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    // typing indicator, then the accepted message
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'turn_started', agentId: 'casey' }))
    expect(storeMock.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'casey', content: expect.stringContaining('arc math') }),
    )
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'message' }))
    expect(storeMock.insertLedger).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'casey', action: 'spoke', triggerEvent: 'evt-1' }),
    )
  })

  it('pass turn: no channel message, turn_ended broadcast, ledgers as passed', async () => {
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([{ id: 'u1', name: 'pass', input: { reason: 'writer just typing, nothing new' } }]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    expect(storeMock.insertMessage).not.toHaveBeenCalled()
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'turn_ended', action: 'passed' }))
    expect(storeMock.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ action: 'passed' }))
  })

  it('context assembly includes blocks, channel, and the trigger event', async () => {
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([{ id: 'u1', name: 'pass', input: { reason: 'n/a' } }]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    const call = sendToolTurnMock.mock.calls[0][0]
    expect(call.system).toContain('Casey')
    expect(call.system).toContain('Last session: Rosa want/need tension.') // private block
    expect(call.system).toContain('VALUE GATE')
    expect(call.system).toContain('AMBIENT TURN') // doc change = ambient, no greetings
    const userMsg = JSON.stringify(call.messages)
    expect(userMsg).toContain('Rosa is the lead.') // channel window
    expect(userMsg).toContain('characters[r1].want') // trigger
    expect(userMsg).toContain('win back the restaurant')
  })

  it('writer-message turns include visible character cards and active field-fill guidance', async () => {
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([{ id: 'u1', name: 'pass', input: { reason: 'n/a' } }]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event: writerMessageEvent })

    const call = sendToolTurnMock.mock.calls[0][0]
    const userMsg = JSON.stringify(call.messages)
    expect(userMsg).toContain("Casey, help me figure out Rosa's want.")
    expect(userMsg).toContain('VISIBLE STORY BIBLE CHARACTER CARDS')
    expect(userMsg).toContain('Rosa [id: r1]')
    expect(userMsg).toContain('file propose_field_write')
  })

  it('malformed turns get the retry nudge and ledger errored if still malformed', async () => {
    // both loop attempts return plain text (no tool uses)
    sendToolTurnMock.mockResolvedValue(toolTurn([], 'plain text answer'))

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    expect(storeMock.insertMessage).not.toHaveBeenCalled()
    expect(storeMock.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ action: 'errored' }))
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'turn_ended', action: 'errored' }))
  })

  it('remember + speak in one turn: block written, message inserted once', async () => {
    storeMock.writeBlock.mockResolvedValue({ ok: true, nearCap: false })
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([
        { id: 'u1', name: 'remember', input: { label: 'lane_notes', value: 'Rosa want updated: restaurant.' } },
        { id: 'u2', name: 'speak', input: { content: 'Logging the want shift; it deepens the father thread.' } },
      ]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    expect(storeMock.writeBlock).toHaveBeenCalledTimes(1)
    expect(storeMock.insertMessage).toHaveBeenCalledTimes(1)
    expect(storeMock.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ action: 'spoke' }))
  })

  it('clears the streaming turn and ledgers errored when message persistence fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    storeMock.insertMessage.mockRejectedValueOnce(new Error('insert failed'))
    sendToolTurnMock.mockResolvedValueOnce(
      toolTurn([{ id: 'u1', name: 'speak', input: { content: 'This should stream before insert fails.' } }]),
    )

    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event })

    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'turn_ended', action: 'errored' }))
    expect(storeMock.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ action: 'errored' }))
    consoleSpy.mockRestore()
  })
})
