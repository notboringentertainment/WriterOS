import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRoomProposal } from '../../client/src/lib/roomApi'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
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
