import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDocuments } from '../../../shared/documents'

const packetStoreMock = vi.hoisted(() => ({
  createPitchPacketDraft: vi.fn(), getPitchPacket: vi.fn(), updatePitchPacketDraft: vi.fn(),
  approvePitchPacketRow: vi.fn(), exportPitchPacketRow: vi.fn(), getLatestExportedPitchPacket: vi.fn(),
}))
vi.mock('../../../server/room/interview/pitchPacketStore', () => packetStoreMock)
const interviewStoreMock = vi.hoisted(() => ({ getInterviewSession: vi.fn(), listInterviewSessions: vi.fn() }))
vi.mock('../../../server/room/interview/store', () => interviewStoreMock)
const roomStoreMock = vi.hoisted(() => ({ getSharedBlockValue: vi.fn(), getSharedBlockSnapshot: vi.fn() }))
vi.mock('../../../server/room/store', () => roomStoreMock)
const auditContextMock = vi.hoisted(() => ({ buildAuditContext: vi.fn() }))
vi.mock('../../../server/room/interview/auditContext', () => auditContextMock)
const providerMock = vi.hoisted(() => ({ isConfigured: vi.fn(() => true), generateResponse: vi.fn(), name: 'openai', model: 'test' }))
vi.mock('../../../server/ai/modelProvider', () => ({ createModelProvider: () => providerMock }))
const traceEvents: object[] = []

const session = { id: 's1', project_id: 'p1', state: 'banked', seed_text: 'A chef returns home after her sister disappears.', answers: [{ question_id: 'q1', answer_text: 'Her sister left a coded recipe.', disposition: 'field_mapped' }] }

function input() {
  const documents = createEmptyDocuments(() => '2026-07-14T00:00:00.000Z')
  documents.synopsis.content.header.title = 'Home Service'
  return { projectId: 'p1', sessionId: 's1', documents, projectMeta: { title: 'Home Service' }, now: () => '2026-07-14T12:00:00.000Z' }
}

beforeEach(() => {
  vi.clearAllMocks()
  interviewStoreMock.getInterviewSession.mockResolvedValue(session)
  interviewStoreMock.listInterviewSessions.mockResolvedValue([session])
  roomStoreMock.getSharedBlockValue.mockImplementation(async (_project: string, label: string) => label === 'story_locks' ? '## Meeting locks\nNone declared.' : 'Nothing delegated — writer holds all intent.')
  roomStoreMock.getSharedBlockSnapshot.mockResolvedValue({ value: 'seed', revision: 5 })
  auditContextMock.buildAuditContext.mockResolvedValue({ activeDecisions: [], priorAnswers: session.answers, coveredAreas: new Set(), storyLocks: '', openQuestions: '' })
  providerMock.generateResponse.mockResolvedValue(JSON.stringify({ logline: 'A chef returns home to solve her sister’s disappearance.', genre: 'Mystery', format: 'Feature', tone: 'Haunted warmth', premise: 'A coded recipe exposes a family crime.', storyEngine: 'Each recipe reveals a new suspect.' }))
  packetStoreMock.createPitchPacketDraft.mockImplementation(async (value: object) => ({ id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'draft', created_at: 'now', exported_at: null, ...value }))
})
afterEach(async () => {
  const { __setMeetingTraceSinkForTests } = await import('../../../server/room/interview/trace')
  __setMeetingTraceSinkForTests(null)
  traceEvents.length = 0
  vi.restoreAllMocks()
})

describe('pitchPacketRuntime', () => {
  it('grounds AI gap proposals in supplied project context and keeps them unapproved', async () => {
    const { __setMeetingTraceSinkForTests } = await import('../../../server/room/interview/trace')
    __setMeetingTraceSinkForTests(event => traceEvents.push(event))
    const { createPitchPacketDraft } = await import('../../../server/room/interview/pitchPacketRuntime')
    const result = await createPitchPacketDraft(input())
    expect(providerMock.generateResponse).toHaveBeenCalledWith(expect.objectContaining({ messages: [{ role: 'user', content: expect.stringContaining('sister') }] }))
    expect(result.row.packet.logline).toMatchObject({ value: 'A chef returns home to solve her sister’s disappearance.', origin: 'ai_proposed', approved: false })
    expect(result.proposalUnavailable).toBe(false)
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'meeting.packet.composed' }),
      expect.objectContaining({ type: 'meeting.packet.proposal_started' }),
      expect.objectContaining({ type: 'meeting.packet.proposal_completed' }),
    ]))
  })

  it('persists an editable blank draft when the proposal provider fails', async () => {
    providerMock.generateResponse.mockRejectedValueOnce(new Error('provider down'))
    const { createPitchPacketDraft } = await import('../../../server/room/interview/pitchPacketRuntime')
    const result = await createPitchPacketDraft(input())
    expect(result.proposalUnavailable).toBe(true)
    expect(result.row.packet.storyEngine).toMatchObject({ value: '', approved: false })
    expect(packetStoreMock.createPitchPacketDraft).toHaveBeenCalled()
  })

  it('rejects unapproved/conflicted packets and stale direction before export', async () => {
    const { approvePitchPacket, createPitchPacketDraft, exportPitchPacket } = await import('../../../server/room/interview/pitchPacketRuntime')
    const draft = await createPitchPacketDraft(input())
    packetStoreMock.getPitchPacket.mockResolvedValue({ ...draft.row, status: 'draft' })
    await expect(approvePitchPacket({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1' })).rejects.toThrow(/cannot be approved/i)
    packetStoreMock.getPitchPacket.mockResolvedValue({ id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'approved', direction_revision: 4, packet: { directionRevision: 4 } })
    await expect(exportPitchPacket({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1', now: () => '2026-07-14T13:00:00.000Z' })).rejects.toThrow(/direction changed/i)
    expect(packetStoreMock.exportPitchPacketRow).not.toHaveBeenCalled()
  })

  it('approves a fully reviewed packet and persists the explicit status transition', async () => {
    const { approvePitchPacket, createPitchPacketDraft } = await import('../../../server/room/interview/pitchPacketRuntime')
    const draft = await createPitchPacketDraft(input())
    const reviewed = structuredClone(draft.row.packet)
    reviewed.coreCharacters = { value: [{ name: 'Mara', role: 'chef', want: 'Find her sister', need: 'Trust her family', flawOrWound: 'Pride', secretOrContradiction: 'She hid the last letter', arc: 'Accepts help' }], origin: 'writer', approved: true, sourceRef: 'writer:coreCharacters' }
    const fields = reviewed as unknown as Record<string, { approved: boolean; conflict?: boolean }>
    for (const key of ['title', 'logline', 'format', 'genre', 'tone', 'premise', 'storyEngine', 'locks', 'openQuestions'] as const) {
      fields[key].approved = true
      delete fields[key].conflict
    }
    packetStoreMock.getPitchPacket.mockResolvedValue({ ...draft.row, packet: reviewed, status: 'draft' })
    packetStoreMock.approvePitchPacketRow.mockResolvedValue({ ...draft.row, packet: reviewed, status: 'approved' })
    await expect(approvePitchPacket({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1' })).resolves.toMatchObject({ status: 'approved' })
    expect(packetStoreMock.approvePitchPacketRow).toHaveBeenCalledWith({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1' })
  })

  it('exports packet and session through one RPC before returning', async () => {
    const { __setMeetingTraceSinkForTests } = await import('../../../server/room/interview/trace')
    __setMeetingTraceSinkForTests(event => traceEvents.push(event))
    const row = { id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'approved', direction_revision: 5, packet: { directionRevision: 5 } }
    packetStoreMock.getPitchPacket.mockResolvedValue(row)
    packetStoreMock.exportPitchPacketRow.mockResolvedValue({ ...row, status: 'exported', exported_at: '2026-07-14T13:00:00.000Z' })
    const { exportPitchPacket } = await import('../../../server/room/interview/pitchPacketRuntime')
    const exported = await exportPitchPacket({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1', now: () => '2026-07-14T13:00:00.000Z' })
    expect(packetStoreMock.exportPitchPacketRow).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1' }))
    expect(exported.status).toBe('exported')
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'meeting.packet.export_started', packetId: 'packet-1' }),
      expect.objectContaining({ type: 'meeting.packet.export_completed', packetId: 'packet-1' }),
    ]))
  })

  it('rejects malformed or cross-project packet edits before persisting', async () => {
    packetStoreMock.getPitchPacket.mockResolvedValue({ id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'draft', direction_revision: 5, packet: {} })
    const { savePitchPacketDraft } = await import('../../../server/room/interview/pitchPacketRuntime')
    await expect(savePitchPacketDraft({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1', packet: {} })).rejects.toThrow()
    expect(packetStoreMock.updatePitchPacketDraft).not.toHaveBeenCalled()
  })
})
