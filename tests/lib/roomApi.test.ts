import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bankInterview, ensureRoomMemory, fetchInterviewBankPreview, isRoomMemoryUnavailable, postRoomEvent, redirectInterviewArea, resolveRoomProposal, syncStoryLocksBlock } from '../../client/src/lib/roomApi'

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
