import { describe, it, expect, vi, afterEach } from 'vitest'
import { postLookbookQuestions } from '../../client/src/lib/lookbookClient'

afterEach(() => vi.unstubAllGlobals())

describe('postLookbookQuestions', () => {
  it('posts the beat key and request id with the session header and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: [{ prompt: 'A?' }], nothingToSee: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await postLookbookQuestions('p 1', 'tok', { beatKey: 'b1', clientRequestId: 'r1' })
    expect(result.questions).toEqual([{ prompt: 'A?' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/lookbook/p%201/questions')
    expect(init.headers['X-WriterOS-Session']).toBe('tok')
    expect(JSON.parse(init.body)).toEqual({ beatKey: 'b1', clientRequestId: 'r1' })
  })

  it('surfaces the 422 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'lookbook_failed', reason: 'zoe unavailable' }), { status: 422 })))
    await expect(postLookbookQuestions('p', 't', { beatKey: 'b', clientRequestId: 'r' })).rejects.toThrow(/422.*zoe unavailable/)
  })
})
