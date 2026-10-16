import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPage, StalePageError } from '../../client/src/lib/pagesApi'

afterEach(() => vi.unstubAllGlobals())
const page = { page: 'synopsis' as const, markdown: 'A traveler returns home.', status: 'draft' as const, revision: 3 }
describe('page writes', () => {
  it('sends the expected persisted revision through the independent page endpoint', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ json: async () => ({ sessionToken: 'session' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ page: { ...page, revision: 4 } }) })
    vi.stubGlobal('fetch', fetch)
    expect((await requestPage('project', 'synopsis', page)).revision).toBe(4)
    expect(fetch.mock.calls[1][0]).toBe('/api/projects/project/pages/synopsis')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ expectedRevision: 3, page })
  })
  it('returns the newer page when keeping an older proposal is refused', async () => {
    const newer = { ...page, revision: 4, markdown: 'A traveler stays home.' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ json: async () => ({ sessionToken: 'session' }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ currentPage: newer }) }))
    try { await requestPage('project', 'synopsis', page); throw new Error('Expected refusal') }
    catch (error) {
      expect(error).toBeInstanceOf(StalePageError)
      expect((error as StalePageError).currentPage).toEqual(newer)
    }
  })
  it('preserves the approval stamp and canon markers in the write', async () => {
    const approved = { ...page, status: 'approved' as const, approvedAt: '2026-10-15T12:00:00.000Z', approvedCanon: [{ id: 'record', version: 'updated' }] }
    const fetch = vi.fn().mockResolvedValueOnce({ json: async () => ({ sessionToken: 'session' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ page: { ...approved, revision: 4 } }) })
    vi.stubGlobal('fetch', fetch)
    await requestPage('project', 'synopsis', approved)
    expect(JSON.parse(fetch.mock.calls[1][1].body).page).toEqual(approved)
  })
})
