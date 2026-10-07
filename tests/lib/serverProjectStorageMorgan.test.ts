import { describe, expect, it, vi } from 'vitest'
import { bootstrapServerProjectStorage } from '../../client/src/lib/serverProjectStorage'

function fetchWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>, morganHost?: boolean) {
  return vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => String(url).endsWith('/bootstrap')
    ? new Response(JSON.stringify({ enabled: true, label: 'Projects', sessionToken: 'private-token', morganHost }))
    : handler(String(url), init))
}

describe('server storage: Morgan', () => {
  it.each([false, undefined])('does not expose Morgan when host flag is %s', async flag => {
    const storage = await bootstrapServerProjectStorage(fetchWith(() => new Response(), flag))
    expect(storage?.morgan).toBeUndefined()
  })

  it('uses injected fetch, authenticated encoded routes and accepts empty 204 responses', async () => {
    const fetcher = fetchWith((url, init) => {
      expect(init.credentials).toBe('same-origin')
      expect((init.headers as Record<string, string>)['X-WriterOS-Session']).toBe('private-token')
      if (url.endsWith('/session') && init.method === 'POST') return new Response(JSON.stringify({ sessionId: 's1', existing: false }))
      if (url.endsWith('/submit')) return new Response(JSON.stringify({ composerId: 'c1' }))
      return new Response(null, { status: 204 })
    }, true)
    const api = (await bootstrapServerProjectStorage(fetcher))!.morgan!
    expect(await api.start('p:1', { fresh: true })).toEqual({ sessionId: 's1', existing: false })
    expect(await api.submit('p:1', 'Hello', { surface: 'Outline' })).toBe('c1')
    await api.answerApproval('p:1', 'r/1', { allow: false, note: 'No' })
    await api.answerProposal('p:1', 'change/1', { outcome: 'stale' })
    await api.stop('p:1', 't1')
    await api.end('p:1')
    expect(fetcher.mock.calls.slice(1).map(([url]) => url)).toEqual([
      '/api/morgan/p%3A1/session', '/api/morgan/p%3A1/submit', '/api/morgan/p%3A1/approval/r%2F1',
      '/api/morgan/p%3A1/proposal/change%2F1', '/api/morgan/p%3A1/stop', '/api/morgan/p%3A1/session',
    ])
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({ text: 'Hello', context: { surface: 'Outline' } })
  })

  it('preserves server status and message for an expired approval', async () => {
    const api = (await bootstrapServerProjectStorage(fetchWith(() => new Response(JSON.stringify({ error: 'not-open', message: 'No longer waiting.' }), { status: 404 }), true)))!.morgan!
    await expect(api.answerApproval('p1', 'r1', { allow: true })).rejects.toMatchObject({ statusCode: 404, message: 'No longer waiting.' })
  })

  it('parses split UTF-8 and multiline CRLF frames, ignoring keepalives', async () => {
    const bytes = new TextEncoder().encode(': keep-alive\r\n\r\ndata:{"type":"resumed",\r\ndata: "ok":false,"message":"café"}\r\n\r\ndata: {"type":"truncated"}\n\n')
    const fetcher = fetchWith(() => new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close() } })), true)
    const api = (await bootstrapServerProjectStorage(fetcher))!.morgan!
    const events: unknown[] = []
    const closed = vi.fn()
    await new Promise<void>(resolve => api.stream('p1', e => events.push(e), () => { closed(); resolve() }))
    expect(events).toEqual([{ type: 'resumed', ok: false, message: 'café' }, { type: 'truncated' }])
    expect(closed).toHaveBeenCalledOnce()
  })

  it('explicit cleanup cancels the reader without reporting closure or late events', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const cancel = vi.fn()
    const fetcher = fetchWith(() => new Response(new ReadableStream({ start(c) { controller = c }, cancel })), true)
    const api = (await bootstrapServerProjectStorage(fetcher))!.morgan!
    const event = vi.fn(), closed = vi.fn()
    const stop = api.stream('p1', event, closed)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    stop(); stop()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(closed).not.toHaveBeenCalled()
    expect(event).not.toHaveBeenCalled()
    expect(controller).toBeDefined()
  })

  it.each(['http', 'malformed', 'network'])('reports %s stream failure exactly once', async kind => {
    const fetcher = fetchWith(() => {
      if (kind === 'network') throw new Error('offline')
      return kind === 'http' ? new Response('{}', { status: 404 })
        : new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: invalid\n\n')); c.close() } }))
    }, true)
    const api = (await bootstrapServerProjectStorage(fetcher))!.morgan!
    const closed = vi.fn()
    await new Promise<void>(resolve => api.stream('p1', vi.fn(), () => { closed(); resolve() }))
    expect(closed).toHaveBeenCalledOnce()
  })
})
