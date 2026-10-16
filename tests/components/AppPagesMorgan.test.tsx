import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { hello } from '../helpers/morganProtocol'

describe('Pages Morgan request and sidebar', () => {
  beforeEach(() => { localStorage.clear(); seedSkippedVoiceProfileState() })
  afterEach(() => vi.unstubAllGlobals())

  it('opens the closed panel, waits for Morgan, and leaves retired sections out of every page', async () => {
    const state = defaultProjectState()
    state.meta.title = 'Sample Project'
    const stored = { id: 'sample-project', createdAt: 1, updatedAt: 2, state }
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') return json({ enabled: true, label: 'Projects', sessionToken: 's', morganHost: true })
      if (url === '/api/project-library/projects') return json({ entries: [{ status: 'ready', warnings: [], ref: {
        kind: 'server', id: stored.id, packageName: 'Sample.writeros', summary: { id: stored.id, title: state.meta.title, createdAt: 1, updatedAt: 2 },
      } }] })
      if (url === `/api/project-library/projects/${stored.id}` && init?.method !== 'PUT') return json({ result: { ok: true, project: stored, warnings: [] }, beatSheet: null })
      if (url.includes('/pages/')) return json({ page: { page: url.split('/').at(-1), markdown: '', status: 'draft', revision: 0 } })
      if (url.endsWith('/memory/snapshot')) return json({ snapshot: { schemaVersion: 1, projectId: stored.id, revision: 0, records: [], conflicts: [] } })
      if (url.endsWith('/session')) return json({ sessionId: 's1', existing: false })
      if (url.endsWith('/stream')) return new Response(new ReadableStream({ start(controller) { stream = controller } }))
      if (url.endsWith('/submit')) return json({ composerId: 'c1' })
      return json({})
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sample Project' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Pages' }))
    await screen.findByRole('button', { name: 'Write it with Morgan' })
    expect(screen.queryByLabelText('Morgan conversation')).toBeNull()
    for (const name of ['Outline', 'Treatment', 'Synopsis']) {
      fireEvent.click(screen.getByRole('button', { name: `${name} not started` }))
      const footer = screen.getByLabelText('Project state')
      expect(within(footer).getByText(name, { exact: true })).toBeDefined()
      expect(footer).not.toHaveTextContent('0 characters')
      expect(screen.queryByText('Act One', { exact: true })).toBeNull()
      expect(screen.queryByText('Opening', { exact: true })).toBeNull()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Write it with Morgan' }))
    await screen.findByLabelText('Morgan conversation')
    await waitFor(() => expect(stream).toBeDefined())
    const submissions = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/submit'))
    expect(submissions()).toHaveLength(0)
    act(() => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'hello', hello: hello() })}\n\n`)))
    await waitFor(() => expect(submissions()).toHaveLength(1))
    expect(JSON.parse(submissions()[0][1]!.body as string)).toMatchObject({ context: { surface: 'page:synopsis' } })
    view.unmount()
  })
})
