import { afterEach, expect, it, vi } from 'vitest'
import { bootstrapServerProjectStorage } from '../../client/src/lib/serverProjectStorage'
import { defaultProjectState } from '../../client/src/lib/projectState'

afterEach(() => vi.unstubAllGlobals())

it('uses the refreshed token for a later beat-sheet call', async () => {
  let bootstraps = 0
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  let beatToken: string | null = null
  vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    beatToken = new Headers(init?.headers).get('X-WriterOS-Session')
    return json({ beatSheet: { kind: 'not-linked' } })
  })
  const adapter = await bootstrapServerProjectStorage(async (url, init) => {
    if (String(url).endsWith('/bootstrap')) return json({ enabled: true, label: 'Projects', sessionToken: ++bootstraps === 1 ? 'old' : 'new' })
    return new Headers(init?.headers).get('X-WriterOS-Session') === 'new'
      ? json({ ref: { id: 'p' } }) : json({ error: 'unauthorized' }, 401)
  })
  await adapter!.writeProject({ id: 'p', createdAt: 1, updatedAt: 2, state: defaultProjectState() })
  await adapter!.beatSheet!.status('p')
  expect(beatToken).toBe('new')
})

it('F20 refreshes a restarted server token and retries the same save once', async () => {
  let bootstraps = 0
  const writes: RequestInit[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const adapter = await bootstrapServerProjectStorage(async (url, init) => {
    if (String(url).endsWith('/bootstrap')) return json({ enabled: true, label: 'Projects', sessionToken: ++bootstraps === 1 ? 'old' : 'new' })
    writes.push(init!)
    return new Headers(init?.headers).get('X-WriterOS-Session') === 'new'
      ? json({ ref: { id: 'p' } }) : json({ error: 'unauthorized' }, 401)
  })
  expect(await adapter!.writeProject({ id: 'p', createdAt: 1, updatedAt: 2, state: defaultProjectState() })).toEqual({ id: 'p' })
  expect(bootstraps).toBe(2)
  expect(writes).toHaveLength(2)
  expect(writes[1].body).toBe(writes[0].body)
})

it('F20 gives plain recovery advice when a new token cannot be fetched', async () => {
  let bootstraps = 0
  const adapter = await bootstrapServerProjectStorage(async url => {
    const body = String(url).endsWith('/bootstrap') && ++bootstraps === 1
      ? { enabled: true, label: 'Projects', sessionToken: 'old' } : {}
    return new Response(JSON.stringify(body), { status: 'enabled' in body ? 200 : 401 })
  })
  await expect(adapter!.writeProject({ id: 'p', createdAt: 1, updatedAt: 2, state: defaultProjectState() }))
    .rejects.toThrow('Reload to keep saving')
})
