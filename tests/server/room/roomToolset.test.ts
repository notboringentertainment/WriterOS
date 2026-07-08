import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storeMock, lockGateMock, broadcastMock } = vi.hoisted(() => ({
  storeMock: {
    writeBlock: vi.fn(),
    insertProposal: vi.fn(),
    insertMessage: vi.fn(),
    insertEvent: vi.fn(),
  },
  lockGateMock: { checkProposalAgainstLocks: vi.fn() },
  broadcastMock: vi.fn(),
}))
vi.mock('../../../server/room/store', () => storeMock)
vi.mock('../../../server/room/lockGate', () => ({
  ...lockGateMock,
  DIGEST_MODEL: 'test-digest-model',
}))
vi.mock('../../../server/room/sseHub', () => ({ broadcast: broadcastMock }))

import { findRoomAttributionViolations, makeRoomToolset } from '../../../server/room/roomToolset'
import { newRecorder } from '../../../server/room/types'

const makeTurn = () => {
  const recorder = newRecorder()
  const toolset = makeRoomToolset({
    projectId: 'p1',
    agentId: 'casey',
    recorder,
    locksText: 'LOCK-1: The ending is fixed — Rosa sells the restaurant.',
    channelAuthors: new Set(['writer', 'casey']),
  })
  return { recorder, toolset }
}

const ctx = { inventory: { canSee: [], cannotSee: [], canDoNow: [], cannotDoYet: [] } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('room toolset dispatch', () => {
  it('speak records content and returns final without writing the channel', async () => {
    const { recorder, toolset } = makeTurn()
    const outcome = await toolset.dispatchTool(
      { id: 'u1', name: 'speak', input: { content: 'The want change cuts against her flaw.' } },
      ctx as never,
    )
    expect(outcome).toMatchObject({ kind: 'final', result: { ok: true, message: expect.stringContaining('want change') } })
    expect(recorder.speak?.content).toContain('want change')
    expect(storeMock.insertMessage).not.toHaveBeenCalled() // insert happens post-guard in runRoomTurn
  })

  it('speak with empty content is an in-turn error', async () => {
    const { toolset } = makeTurn()
    const outcome = await toolset.dispatchTool({ id: 'u1', name: 'speak', input: { content: '  ' } }, ctx as never)
    expect(outcome.kind).toBe('error')
  })

  it('pass records the reason and ends the turn silently', async () => {
    const { recorder, toolset } = makeTurn()
    const outcome = await toolset.dispatchTool(
      { id: 'u1', name: 'pass', input: { reason: 'nothing that changes what the writer does next' } },
      ctx as never,
    )
    expect(outcome).toMatchObject({ kind: 'final', result: { ok: true, message: '' } })
    expect(recorder.passReason).toMatch(/nothing/)
  })

  it('remember writes the private block and reports cap violations in-turn', async () => {
    const { recorder, toolset } = makeTurn()
    storeMock.writeBlock.mockResolvedValueOnce({ ok: true, nearCap: false })
    const ok = await toolset.dispatchTool(
      { id: 'u1', name: 'remember', input: { label: 'lane_notes', value: 'Rosa: want/need tension noted.' } },
      ctx as never,
    )
    expect(ok).toMatchObject({ kind: 'continue' })
    expect(recorder.remembers).toBe(1)
    expect(storeMock.writeBlock).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'casey', label: 'lane_notes', charCap: 4000 }))

    storeMock.writeBlock.mockResolvedValueOnce({ ok: false, reason: 'Block "lane_notes" is capped at 4000 characters; your value is 5000. Condense it and try again.' })
    const overCap = await toolset.dispatchTool(
      { id: 'u2', name: 'remember', input: { label: 'lane_notes', value: 'x' } },
      ctx as never,
    )
    expect(overCap).toMatchObject({ kind: 'error', content: expect.stringContaining('capped at 4000') })
  })

  it('remember near cap queues a digest event (§7.4)', async () => {
    const { toolset } = makeTurn()
    storeMock.writeBlock.mockResolvedValueOnce({ ok: true, nearCap: true })
    storeMock.insertEvent.mockResolvedValueOnce({})
    await toolset.dispatchTool({ id: 'u1', name: 'remember', input: { label: 'lane_notes', value: 'long' } }, ctx as never)
    expect(storeMock.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'idle_tick', payload: expect.objectContaining({ reason: 'cap_overflow' }) }),
    )
  })

  it('remember rejects unknown labels', async () => {
    const { toolset } = makeTurn()
    const outcome = await toolset.dispatchTool(
      { id: 'u1', name: 'remember', input: { label: 'shared_canon', value: 'x' } },
      ctx as never,
    )
    expect(outcome).toMatchObject({ kind: 'error', content: expect.stringContaining('lane_notes') })
    expect(storeMock.writeBlock).not.toHaveBeenCalled()
  })

  it('propose files a pending proposal, posts a channel ref, and broadcasts', async () => {
    const { recorder, toolset } = makeTurn()
    lockGateMock.checkProposalAgainstLocks.mockResolvedValueOnce({ blocked: false })
    storeMock.insertProposal.mockResolvedValueOnce({ id: 'prop-1', agent_id: 'casey', surface: 'storyBible', field_path: 'characters[r1].want' })
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', kind: 'proposal_ref' })

    const outcome = await toolset.dispatchTool(
      {
        id: 'u1',
        name: 'propose_field_write',
        input: { surface: 'storyBible', fieldPath: 'characters[r1].want', value: 'To be seen by her father', rationale: 'Aligns want with the wound.' },
      },
      ctx as never,
    )

    expect(outcome).toMatchObject({ kind: 'continue', content: expect.stringContaining('pending') })
    expect(recorder.proposalsFiled).toBe(1)
    expect(storeMock.insertProposal).toHaveBeenCalledWith(expect.objectContaining({ fieldPath: 'characters[r1].want' }))
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'proposal' }))
    expect(broadcastMock).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'message' }))
  })

  it('propose blocked by a lock persists as blocked and tells the agent in-turn (§7.3)', async () => {
    const { recorder, toolset } = makeTurn()
    lockGateMock.checkProposalAgainstLocks.mockResolvedValueOnce({ blocked: true, reason: 'LOCK-1 pins the ending' })
    storeMock.insertProposal.mockResolvedValueOnce({ id: 'prop-2', status: 'blocked' })

    const outcome = await toolset.dispatchTool(
      {
        id: 'u1',
        name: 'propose_field_write',
        input: { surface: 'storyBible', fieldPath: 'characters[r1].arc', value: 'Rosa keeps the restaurant', rationale: 'Happier.' },
      },
      ctx as never,
    )

    expect(outcome).toMatchObject({ kind: 'continue', content: expect.stringContaining('BLOCKED') })
    expect(recorder.proposalsBlocked).toBe(1)
    expect(storeMock.insertProposal).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }))
    expect(broadcastMock).not.toHaveBeenCalled() // no card, no channel ref for blocked proposals
  })

  it('propose validates surface and required fields', async () => {
    const { toolset } = makeTurn()
    const outcome = await toolset.dispatchTool(
      { id: 'u1', name: 'propose_field_write', input: { surface: 'script', fieldPath: 'x', value: 'y', rationale: 'z' } },
      ctx as never,
    )
    expect(outcome.kind).toBe('error')
  })
})

describe('room attribution guard (§7.2 / D9)', () => {
  it('flags attributing a position to an agent who has not spoken', () => {
    const violations = findRoomAttributionViolations(
      "Oliver's read is that the midpoint sags.",
      new Set(['writer', 'casey']),
      'casey',
    )
    expect(violations).toEqual(['oliver'])
  })

  it('allows referencing agents who have messages in the channel window', () => {
    const violations = findRoomAttributionViolations(
      'Morgan said the ending needs pressure, and I agree.',
      new Set(['writer', 'writingPartner']),
      'casey',
    )
    expect(violations).toEqual([])
  })

  it('never flags the speaking agent itself', () => {
    expect(findRoomAttributionViolations('Per Casey — me — this holds.', new Set(), 'casey')).toEqual([])
  })
})
