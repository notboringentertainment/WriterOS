import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvePitchPacket, bankInterview, createPitchPacketDraft, ensureRoomMemory, exportPitchPacket, fetchExportedPitchPacket, fetchInterviewBankPreview, isRoomMemoryUnavailable, postRoomEvent, redirectInterviewArea, resolveRoomProposal, savePitchPacketDraft, syncStoryLocksBlock } from '../../client/src/lib/roomApi'
import { createEmptyDocuments } from '../../shared/documents'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('room memory failure surfacing', () => {
  it('recognizes only confirmed memory-contract 503 errors', () => {
    expect(isRoomMemoryUnavailable(new Error('room api 503: {"message":"Room memory unavailable."}'))).toBe(true)
    expect(isRoomMemoryUnavailable(new Error('room api 500: boom'))).toBe(false)
    expect(isRoomMemoryUnavailable(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('classifies mutation outcomes and uses recovery endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Room memory unavailable."}', { status: 503 }))
    await expect(syncStoryLocksBlock('p1', '- lock')).resolves.toEqual({ outcome: 'memory_unavailable' })
    fetchMock.mockResolvedValueOnce(new Response('{"message":"too large"}', { status: 413 }))
    await expect(syncStoryLocksBlock('p1', '- lock')).resolves.toMatchObject({ outcome: 'failed', status: 413, message: 'too large' })
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Room memory unavailable."}', { status: 503 }))
    await expect(postRoomEvent('p1', 'session_opened', {})).resolves.toEqual({ outcome: 'memory_unavailable' })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await expect(ensureRoomMemory('p1')).resolves.toEqual({ outcome: 'ok' })
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('/memory/ensure')
  })
})

describe('roomApi.resolveRoomProposal', () => {
  it('sends edited resolved value and origin override when provided', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposal: { id: 'p1', status: 'adopted' } }),
    })

    await resolveRoomProposal('project A', 'proposal 1', 'adopted', {
      resolvedValue: 'writer edited value',
      origin: 'extrapolated',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/room/project%20A/proposals/proposal%201/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ status: 'adopted', resolved_value: 'writer edited value', origin: 'extrapolated' }),
      }),
    )
  })
})

describe('Project Meeting revision transport', () => {
  it('sends the same in-flight operations to preview and bank and supports immediate redirect', async () => {
    const ok = { ok: true, json: async () => ({}) }
    fetchMock.mockResolvedValue(ok)
    const operations = [{ op: 'retract' as const, targetId: 'd1' }]
    await fetchInterviewBankPreview('project A', 'session 1', {}, operations)
    await bankInterview('project A', 'session 1', {}, operations)
    await redirectInterviewArea('project A', 'session 1', 'ending', 'morgan-ending')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mutability: {}, operations })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ mutability: {}, operations })
    expect(fetchMock.mock.calls[2]).toEqual(expect.arrayContaining(['/api/room/project%20A/interview/session%201/redirect']))
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ area: 'ending', questionId: 'morgan-ending' })
  })
})

describe('Pitch Packet transport', () => {
  it('uses explicit draft, save, approve, export, and persisted re-download endpoints', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const documents = createEmptyDocuments()
    await createPitchPacketDraft('p1', 's1', documents, { title: 'Ace' })
    await savePitchPacketDraft('p1', 's1', 'packet-1', { packetVersion: 1 } as never)
    await approvePitchPacket('p1', 's1', 'packet-1')
    await exportPitchPacket('p1', 's1', 'packet-1')
    await fetchExportedPitchPacket('p1', 's1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ documents, projectMeta: { title: 'Ace' } })
    expect(fetchMock.mock.calls.map(call => [call[1]?.method ?? 'GET', call[0]])).toEqual([
      ['POST', '/api/room/p1/interview/s1/pitch-packet/draft'],
      ['PATCH', '/api/room/p1/interview/s1/pitch-packet/packet-1'],
      ['POST', '/api/room/p1/interview/s1/pitch-packet/packet-1/approve'],
      ['POST', '/api/room/p1/interview/s1/pitch-packet/packet-1/export'],
      ['GET', '/api/room/p1/interview/s1/pitch-packet/exported'],
    ])
  })
})
