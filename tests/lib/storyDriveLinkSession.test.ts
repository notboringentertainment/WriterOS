import { expect, it } from 'vitest'
import { bootstrapServerProjectStorage } from '../../client/src/lib/serverProjectStorage'

it('Link to Story-drive refreshes a restarted server session and retries once', async () => {
  let bootstraps = 0
  const tokens: Array<string | null> = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const adapter = await bootstrapServerProjectStorage(async (url, init) => {
    if (String(url).endsWith('/bootstrap')) return json({ enabled: true, label: 'Projects', sessionToken: ++bootstraps === 1 ? 'old' : 'new' })
    const token = new Headers(init?.headers).get('X-WriterOS-Session')
    tokens.push(token)
    return token === 'new' ? json({ searchRoot: '/Scripts', folders: [] }) : json({ error: 'unauthorized' }, 401)
  })
  await expect(adapter!.storyDrive!.folders()).resolves.toEqual({ searchRoot: '/Scripts', folders: [] })
  expect(tokens).toEqual(['old', 'new'])
})
