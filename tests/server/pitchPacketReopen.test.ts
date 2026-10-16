import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDocuments } from '../../shared/documents'

// F22: coming back to a banked Meeting and opening the packet again must
// reopen the saved draft or approved packet, never replace it.

const packetStoreMock = vi.hoisted(() => ({
  createPitchPacketDraft: vi.fn(), getPitchPacket: vi.fn(), updatePitchPacketDraft: vi.fn(),
  approvePitchPacketRow: vi.fn(), exportPitchPacketRow: vi.fn(), getLatestExportedPitchPacket: vi.fn(),
  getOpenPitchPacket: vi.fn(),
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

const session = { id: 's1', project_id: 'p1', state: 'banked', seed_text: 'seed', answers: [] }
const savedReceipt = { revision: 4, status: 'available', citations: [], conflictIds: [] }

beforeEach(() => {
  vi.clearAllMocks()
  interviewStoreMock.getInterviewSession.mockResolvedValue(session)
})

describe('Pitch Packet reopen (F22)', () => {
  it('returns the saved approved packet and never makes a new draft or calls the model', async () => {
    const saved = { id: 'saved', project_id: 'p1', session_id: 's1', status: 'approved', packet: {}, memory_receipt: savedReceipt }
    packetStoreMock.getOpenPitchPacket.mockResolvedValue(saved)
    const { createPitchPacketDraft } = await import('../../server/room/interview/pitchPacketRuntime')

    const result = await createPitchPacketDraft({ projectId: 'p1', sessionId: 's1', documents: createEmptyDocuments(), now: () => '2026-10-16T00:00:00.000Z' })

    expect(result).toEqual({ row: saved, proposalUnavailable: false, memoryReceipt: savedReceipt, reopened: true })
    expect(packetStoreMock.getOpenPitchPacket).toHaveBeenCalledWith({ projectId: 'p1', sessionId: 's1' })
    expect(packetStoreMock.createPitchPacketDraft).not.toHaveBeenCalled()
    expect(providerMock.generateResponse).not.toHaveBeenCalled()
  })
})
