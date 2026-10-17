import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDocuments } from '../../shared/documents'
import type { ProjectMemoryProvider } from '../../server/projectMemory/agentContext'
import { RoomMemoryError } from '../../server/room/memoryContract'

const packetStoreMock = vi.hoisted(() => ({
  createPitchPacketDraft: vi.fn(), getPitchPacket: vi.fn(), updatePitchPacketDraft: vi.fn(),
  approvePitchPacketRow: vi.fn(), exportPitchPacketRow: vi.fn(), getLatestExportedPitchPacket: vi.fn(),
  getOpenPitchPacket: vi.fn(), // F22 (Ben approved this protected-test edit, 2026-10-16)
}))
vi.mock('../../server/room/interview/pitchPacketStore', () => packetStoreMock)
const interviewStoreMock = vi.hoisted(() => ({ getInterviewSession: vi.fn(), listInterviewSessions: vi.fn() }))
vi.mock('../../server/room/interview/store', () => interviewStoreMock)
const roomStoreMock = vi.hoisted(() => ({ getSharedBlockValue: vi.fn(), getSharedBlockSnapshot: vi.fn() }))
vi.mock('../../server/room/store', () => roomStoreMock)
const auditContextMock = vi.hoisted(() => ({ buildAuditContext: vi.fn() }))
vi.mock('../../server/room/interview/auditContext', () => auditContextMock)
const providerMock = vi.hoisted(() => ({ isConfigured: vi.fn(() => true), generateResponse: vi.fn(), name: 'openai', model: 'test' }))
vi.mock('../../server/ai/modelProvider', () => ({ createModelProvider: () => providerMock }))
const traceEvents: object[] = []

const session = { id: 's1', project_id: 'p1', state: 'banked', seed_text: 'A chef returns home after her sister disappears.', answers: [{ question_id: 'q1', answer_text: 'Her sister left a coded recipe.', disposition: 'field_mapped' }] }

function input() {
  const documents = createEmptyDocuments(() => '2026-07-14T00:00:00.000Z')
  documents.synopsis.content.header.title = 'Home Service'
  return { projectId: 'p1', sessionId: 's1', documents, projectMeta: { title: 'Home Service' }, now: () => '2026-07-14T12:00:00.000Z' }
}

const pitchCitation = '[M-6182-00630061006E006F006E]'
function pitchMemoryProvider(): ProjectMemoryProvider {
  return {
    context: vi.fn().mockResolvedValue({
      projectId: 'p1', revision: 31,
      activeCanon: [{
        id: 'canon', projectId: 'p1', kind: 'canon', status: 'active',
        claim: 'Mara cannot sell the family restaurant.', tags: [], entities: [],
        source: { workflow: 'writeros', sourceId: 'lock', sourceUri: 'writeros://locks/mara', sourceHash: 'h', capturedAt: '2026-08-14T12:00:00.000Z', approval: 'explicit' },
        evidence: [], safety: 'clear', spoiler: false, supersedes: [],
        createdAt: '2026-08-14T12:00:00.000Z', updatedAt: '2026-08-14T12:00:00.000Z',
      }],
      relevant: [], conflicts: [], spoilerConflictIds: [],
      citationMap: { [pitchCitation]: { workflow: 'writeros', sourceId: 'lock', sourceUri: 'writeros://locks/mara', sourceHash: 'h', capturedAt: '2026-08-14T12:00:00.000Z', approval: 'explicit' } },
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  interviewStoreMock.getInterviewSession.mockResolvedValue(session)
  interviewStoreMock.listInterviewSessions.mockResolvedValue([session])
  roomStoreMock.getSharedBlockValue.mockImplementation(async (_project: string, label: string) => label === 'story_locks' ? '## Meeting locks\nNone declared.' : 'Nothing delegated — writer holds all intent.')
  roomStoreMock.getSharedBlockSnapshot.mockResolvedValue({ value: 'seed', revision: 5 })
  auditContextMock.buildAuditContext.mockResolvedValue({ activeDecisions: [], priorAnswers: session.answers, coveredAreas: new Set(), storyLocks: '', openQuestions: '' })
  providerMock.generateResponse.mockResolvedValue(JSON.stringify({ logline: 'A chef returns home to solve her sister’s disappearance.', genre: 'Mystery', format: 'Feature', tone: 'Haunted warmth', premise: 'A coded recipe exposes a family crime.', storyEngine: 'Each recipe reveals a new suspect.' }))
  packetStoreMock.getOpenPitchPacket.mockResolvedValue(null)
  packetStoreMock.createPitchPacketDraft.mockImplementation(async (value: object) => ({ id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'draft', created_at: 'now', exported_at: null, ...value }))
})

describe('two Pitch Packet requests at the same instant', () => {
  it('the second reopens the packet the first made instead of failing', async () => {
    const { createPitchPacketDraft } = await import('../../server/room/interview/pitchPacketRuntime')
    const winner = { id: 'packet-1', project_id: 'p1', session_id: 's1', status: 'draft', created_at: 'now', exported_at: null, memory_receipt: null }
    packetStoreMock.getOpenPitchPacket.mockResolvedValueOnce(null).mockResolvedValueOnce(winner)
    packetStoreMock.createPitchPacketDraft.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
    const result = await createPitchPacketDraft({ ...input(), memoryProvider: pitchMemoryProvider() })
    expect(result.reopened).toBe(true)
    expect(result.row).toBe(winner)
  })

  it('still fails when the insert fails for another reason and no packet is open', async () => {
    const { createPitchPacketDraft } = await import('../../server/room/interview/pitchPacketRuntime')
    packetStoreMock.createPitchPacketDraft.mockRejectedValueOnce(new Error('database down'))
    await expect(createPitchPacketDraft({ ...input(), memoryProvider: pitchMemoryProvider() })).rejects.toThrow('database down')
  })
})
