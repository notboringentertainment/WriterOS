import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import type { PageProposal } from '../../shared/morganLive'

let deliver: (p: { proposalId: string; proposal: PageProposal } | null) => void
vi.mock('../../client/src/components/shell/LeftRail', () => ({
  LeftRail: (props: { morgan?: unknown; morganProjectId?: string; onMorganPageProposal: typeof deliver }) => {
    deliver = props.onMorganPageProposal
    return props.morgan && props.morganProjectId ? <span>Hosted screen</span> : null
  },
}))

function setup() {
  const projects = ['project-one', 'project-two'].map((id, i) => {
    const state = defaultProjectState()
    state.meta.title = `Project ${i + 1}`
    state.script.rawHtml = '<p data-element-type="scene-heading">INT. ROOM - DAY</p><p data-element-type="action">Quiet.</p>'
    return { id, createdAt: 1, updatedAt: 2, state }
  })
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/project-library/bootstrap') return json({ enabled: true, label: 'Projects', sessionToken: 's', morganHost: true })
    if (url === '/api/project-library/projects') return json({ entries: projects.map(p => ({ status: 'ready', warnings: [], ref: { kind: 'server', id: p.id, packageName: `${p.id}.writeros`, summary: { id: p.id, title: p.state.meta.title, createdAt: 1, updatedAt: 2 } } })) })
    if (url.includes('/api/morgan/')) return new Response(null, { status: 204 })
    for (const p of projects) {
      if (url === `/api/project-library/projects/${p.id}` && init?.method !== 'PUT') return json({ result: { ok: true, project: structuredClone(p), warnings: [] }, beatSheet: null })
      if (url === `/api/projects/${p.id}/pages/synopsis`) {
        const page = init?.method === 'PUT' ? JSON.parse(init.body as string).page : { page: 'synopsis', markdown: '', status: 'draft', revision: 0 }
        return json({ page: { ...page, revision: init?.method === 'PUT' ? page.revision + 1 : page.revision } })
      }
    }
    return json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  return { projects, fetchMock }
}
const scriptProposal: PageProposal = {
  surface: 'script', summary: 'Proposed scene change',
  target: { kind: 'replace-scene', sceneHeading: 'INT. ROOM - DAY', expectedScene: [{ type: 'scene-heading', text: 'INT. ROOM - DAY' }, { type: 'action', text: 'Quiet.' }] },
  blocks: [{ type: 'scene-heading', text: 'INT. ROOM - DAY' }, { type: 'action', text: 'Rain.' }],
}
async function openFirst() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open Project 1' }))
  await screen.findByText('Hosted screen')
}
const answers = (fetchMock: ReturnType<typeof setup>['fetchMock']) => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/morgan/') && String(url).includes('/proposal/'))

describe('App hosted proposal ownership and existing preview integration', () => {
  beforeEach(() => { localStorage.clear(); seedSkippedVoiceProfileState() })
  afterEach(() => vi.unstubAllGlobals())

  it('shows a prose proposal on its matching page, saves Keep through the page PUT, then answers Morgan', async () => {
    const { fetchMock } = setup()
    await openFirst()
    const markdown = '# Synopsis\n\nA courier crosses a flooded city.'
    act(() => deliver({ proposalId: 'page-proposal', proposal: { surface: 'page', page: 'synopsis', baseRevision: 0, markdown, summary: 'A new synopsis draft' } }))
    await screen.findByRole('heading', { name: "Morgan's suggestion" })
    expect(screen.getByRole('button', { name: 'Synopsis not started' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(answers(fetchMock)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    const put = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/projects/project-one/pages/synopsis' && init?.method === 'PUT')!
    expect(JSON.parse(put[1]!.body as string)).toEqual({ expectedRevision: 0, page: { page: 'synopsis', markdown, status: 'draft', revision: 0 } })
    expect(answers(fetchMock)[0][0]).toBe('/api/morgan/project-one/proposal/page-proposal')
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'kept' })
    expect(screen.queryByRole('heading', { name: "Morgan's suggestion" })).not.toBeInTheDocument()
    expect(screen.getByText('A courier crosses a flooded city.')).toBeInTheDocument()
  })

  it('clears a script proposal on project switch and ignores the old callback without answering', async () => {
    const { fetchMock } = setup()
    await openFirst()
    const oldDeliver = deliver
    oldDeliver({ proposalId: 'proposal-1', proposal: scriptProposal })
    await screen.findByText('Proposed scene change')
    fireEvent.click(screen.getByRole('button', { name: 'WriterOS' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Project 2' }))
    await screen.findByLabelText('Project title: Project 2')
    oldDeliver({ proposalId: 'proposal-late', proposal: scriptProposal })
    await waitFor(() => expect(screen.queryByText('Proposed scene change')).not.toBeInTheDocument())
    expect(answers(fetchMock)).toHaveLength(0)
  })

  it('applies a structured proposal through the existing preview and answers kept', async () => {
    const { projects, fetchMock } = setup()
    await openFirst()
    const outline = projects[0].state.documents.outline
    deliver({ proposalId: 'proposal-2', proposal: { surface: 'outline', baseRevision: outline.revision, content: outline.content, summary: 'Structured update' } })
    await screen.findByText('Structured update')
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    expect(answers(fetchMock)[0][0]).toBe('/api/morgan/project-one/proposal/proposal-2')
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'kept' })
  })

  it('dismisses a structured proposal without applying and answers dismissed', async () => {
    const { projects, fetchMock } = setup()
    await openFirst()
    const outline = projects[0].state.documents.outline
    deliver({ proposalId: 'proposal-3', proposal: { surface: 'outline', baseRevision: outline.revision, content: outline.content, summary: 'Dismiss this update' } })
    await screen.findByText('Dismiss this update')
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'dismissed' })
  })

  it('keeps a structured suggestion open without answering Morgan', async () => {
    const { projects, fetchMock } = setup()
    await openFirst()
    const outline = projects[0].state.documents.outline
    const entry = { proposalId: 'proposal-4', proposal: { surface: 'outline' as const, baseRevision: outline.revision, content: outline.content, summary: 'Keep this suggestion' } }
    deliver(entry)
    await screen.findByText('Keep this suggestion')
    fireEvent.click(screen.getByRole('button', { name: /keep as suggestion/i }))
    expect(screen.queryByText('Keep this suggestion')).not.toBeInTheDocument()
    expect(answers(fetchMock)).toHaveLength(0)
    deliver(entry) // Show on page in the hosted rail reopens the same proposal.
    expect(await screen.findByText('Keep this suggestion')).toBeInTheDocument()
  })

  it('rejects a stale structured revision and keeps the existing error visible', async () => {
    const { projects, fetchMock } = setup()
    await openFirst()
    const outline = projects[0].state.documents.outline
    deliver({ proposalId: 'proposal-5', proposal: { surface: 'outline', baseRevision: outline.revision + 1, content: outline.content, summary: 'Stale structured suggestion' } })
    await screen.findByText('Stale structured suggestion')
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'stale', note: expect.stringMatching(/out of date/) })
    deliver(null) // The server has removed the answered proposal from its open list.
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of date/)
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(answers(fetchMock)).toHaveLength(1)
  })

  it('keeps a script change and sends its outcome for the original project', async () => {
    const { fetchMock } = setup()
    await openFirst()
    deliver({ proposalId: 'proposal-6', proposal: scriptProposal })
    await screen.findByText('Proposed scene change')
    fireEvent.click(screen.getByRole('button', { name: /^keep$/i }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'kept' })
    expect(screen.queryByText('Proposed scene change')).not.toBeInTheDocument()
    expect(document.querySelector('.tiptap')?.textContent).toContain('Rain.')
  })

  it('answers stale once and retains the script explanation until dismissal', async () => {
    const { fetchMock } = setup()
    await openFirst()
    deliver({ proposalId: 'proposal-7', proposal: { ...scriptProposal, target: { kind: 'replace-scene', sceneHeading: 'EXT. FIELD - DAY', expectedScene: [] } } })
    await screen.findByText('Proposed scene change')
    fireEvent.click(screen.getByRole('button', { name: /^keep$/i }))
    await waitFor(() => expect(answers(fetchMock)).toHaveLength(1))
    expect(JSON.parse(answers(fetchMock)[0][1]!.body as string)).toEqual({ outcome: 'stale' })
    deliver(null)
    expect(await screen.findByRole('alert')).toHaveTextContent(/script changed since Morgan read it/)
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(answers(fetchMock)).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
