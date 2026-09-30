import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function syncedProject(id: string, title: string) {
  const state = defaultProjectState()
  state.meta.title = title
  state.documents.outline.content.beatSheetSource = {
    ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: null,
  }
  state.documents.outline.content.units = [
    { ...createOutlineUnit(`${id}-beat`), number: 1, title: `${title} beat`, whatHappens: `${title} original.` },
  ]
  return { id, createdAt: 1, updatedAt: 2, state }
}

describe('App lookbook ask', () => {
  beforeEach(() => { localStorage.clear(); seedSkippedVoiceProfileState() })
  afterEach(() => vi.unstubAllGlobals())

  it('drops an ask result that lands after switching to another project', async () => {
    const a = syncedProject('ask-project-a', 'Alpha')
    const b = syncedProject('ask-project-b', 'Bravo')
    const refs = [a, b].map(p => ({
      kind: 'server', id: p.id, packageName: `${p.state.meta.title}.writeros`,
      summary: { id: p.id, title: p.state.meta.title, createdAt: 1, updatedAt: 2 },
    }))
    const status = { kind: 'unchanged', ticket: 'T-1', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1 }
    const pending = deferred<unknown>()
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') return json({ enabled: true, label: 'WriterOS Projects', sessionToken: 's' })
      if (url === '/api/project-library/projects') return json({ entries: refs.map(ref => ({ status: 'ready', ref, warnings: [] })) })
      if (url.endsWith('/questions')) return json(await pending.promise)
      if (url.endsWith('/beat-sheet/status')) return json({ beatSheet: status })
      for (const p of [a, b]) {
        if (url === `/api/project-library/projects/${p.id}` && init?.method !== 'PUT') {
          return json({ result: { ok: true, project: structuredClone(p), warnings: [] }, beatSheet: status })
        }
      }
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Alpha' }))
    await screen.findByLabelText('Project title: Alpha')
    fireEvent.click(screen.getByRole('tab', { name: 'Beat Sheet' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Zoe what this looks like' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/questions'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Bravo' }))
    await screen.findByLabelText('Project title: Bravo')
    pending.resolve({ questions: [{ prompt: 'STALE ONE?' }, { prompt: 'STALE TWO?' }], nothingToSee: false })

    fireEvent.click(screen.getByRole('tab', { name: 'Beat Sheet' }))
    expect(await screen.findByText('Bravo original.')).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(screen.queryByText('STALE ONE?')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('In your own words')).not.toBeInTheDocument()
    expect(screen.queryByText('Zoe found nothing to see here yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask Zoe what this looks like' })).toBeInTheDocument()
  })
})
