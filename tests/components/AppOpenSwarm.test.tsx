import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument } from '@shared/voiceProfile'
import { defaultProjectState } from '../../client/src/lib/projectState'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    displayName: 'Ben',
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure', 'genre momentum'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Ursula K. Le Guin'],
      directors: ['Denis Villeneuve'],
      filmsAndShows: ['Arrival'],
      scenesAndLines: ['quiet impossible choice'],
      notes: 'Measured, humane, precise.',
    },
    characterInstincts: {
      drawnTo: ['competent people with private grief'],
      rejects: ['empty cynicism'],
      notes: 'Characters should reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional, sharper when defensive',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames', 'lonely scale'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline enough to know the pressure, then draft into discovery',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise', 'tone'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

async function sendSwarmMessage() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

  fireEvent.click(screen.getByTitle('Morgan'))
  fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), {
    target: { value: '/swarm review this against my voice' },
  })
  fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      '/api/openswarm/writing-partner',
      expect.objectContaining({ method: 'POST' })
    )
  })
}

describe('App OpenSwarm handoff', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'OpenSwarm saw the handoff.',
        memoryReceipt: { revision: 0, status: 'disabled', citations: [], conflictIds: [] },
      }),
    }))
  })

  it('includes completed Voice Profile when sending a /swarm message', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    await sendSwarmMessage()

    const swarmCall = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/openswarm/writing-partner')
    const body = JSON.parse(String(swarmCall?.[1]?.body))
    expect(body.message).toBe('review this against my voice')
    expect(body.projectId).toBeUndefined()
    expect(body.voiceProfile?.archetype).toBe(profile.archetype)
    expect(body.voiceProfile?.dialogue.rules).toEqual(['subtext before explanation'])
    expect(await screen.findByText(/project memory disabled/i)).toBeInTheDocument()
  })

  it('omits draft Voice Profile when sending a /swarm message', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'draft_profile',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    await sendSwarmMessage()

    const swarmCall = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/openswarm/writing-partner')
    const body = JSON.parse(String(swarmCall?.[1]?.body))
    expect(body.message).toBe('review this against my voice')
    expect(body.voiceProfile).toBeUndefined()
  })

  it('sends the active stable projectId after opening a folder-backed project', async () => {
    const state = defaultProjectState()
    state.meta.title = 'Folder Memory Project'
    const stored = { id: 'folder-memory-project-1', createdAt: 1, updatedAt: 2, state }
    const ref = {
      kind: 'server', id: stored.id, packageName: 'Folder Memory Project.writeros',
      summary: { id: stored.id, title: state.meta.title, createdAt: 1, updatedAt: 2 },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') return { ok: true, status: 200, json: async () => ({ enabled: true, label: 'WriterOS Projects', sessionToken: 'session' }) }
      if (url === '/api/project-library/projects') return { ok: true, status: 200, json: async () => ({ entries: [{ status: 'ready', ref, warnings: [] }] }) }
      if (url === `/api/project-library/projects/${stored.id}`) return { ok: true, status: 200, json: async () => ({ result: { ok: true, project: stored, warnings: [] } }) }
      if (url === '/api/openswarm/writing-partner') return {
        ok: true, status: 200,
        json: async () => ({ message: 'Folder grounded.', memoryReceipt: { revision: 7, status: 'available', citations: [], conflictIds: [] } }),
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Folder Memory Project' }))
    await screen.findByLabelText('Project title: Folder Memory Project')
    fireEvent.click(screen.getByTitle('Morgan'))
    fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), { target: { value: '/swarm ground this' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/openswarm/writing-partner')).toBe(true))
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/openswarm/writing-partner')
    expect(JSON.parse(String(call?.[1]?.body)).projectId).toBe(stored.id)
  })

  it('retains the exact memory receipt when OpenSwarm reports an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/openswarm/writing-partner') return {
        ok: false, status: 502,
        json: async () => ({
          message: 'OpenSwarm is reachable, but Writing Partner could not complete the request.',
          memoryReceipt: { revision: 73, status: 'available', citations: [], conflictIds: ['conflict-73'] },
        }),
      }
      return { ok: true, status: 200, json: async () => ({}) }
    }))

    await sendSwarmMessage()

    expect(await screen.findByText(/OpenSwarm is reachable/i)).toBeInTheDocument()
    expect(screen.getByText(/project memory revision 73/i)).toBeInTheDocument()
  })

  it('ignores a deferred OpenSwarm response after switching from folder project A to B', async () => {
    const stateA = defaultProjectState(); stateA.meta.title = 'Swarm Project A'
    const stateB = defaultProjectState(); stateB.meta.title = 'Swarm Project B'
    const storedA = { id: 'swarm-project-a', createdAt: 1, updatedAt: 2, state: stateA }
    const storedB = { id: 'swarm-project-b', createdAt: 3, updatedAt: 4, state: stateB }
    const refs = [storedA, storedB].map(stored => ({
      kind: 'server', id: stored.id, packageName: `${stored.state.meta.title}.writeros`,
      summary: { id: stored.id, title: stored.state.meta.title, createdAt: stored.createdAt, updatedAt: stored.updatedAt },
    }))
    const pending = deferred<Record<string, unknown>>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') return { ok: true, status: 200, json: async () => ({ enabled: true, label: 'WriterOS Projects', sessionToken: 'session' }) }
      if (url === '/api/project-library/projects') return { ok: true, status: 200, json: async () => ({ entries: refs.map(ref => ({ status: 'ready', ref, warnings: [] })) }) }
      if (url === `/api/project-library/projects/${storedA.id}`) return { ok: true, status: 200, json: async () => ({ result: { ok: true, project: structuredClone(storedA), warnings: [] } }) }
      if (url === `/api/project-library/projects/${storedB.id}`) return { ok: true, status: 200, json: async () => ({ result: { ok: true, project: structuredClone(storedB), warnings: [] } }) }
      if (url === '/api/openswarm/writing-partner') return { ok: true, status: 200, json: async () => pending.promise }
      if (init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true }) }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Swarm Project A' }))
    await screen.findByLabelText('Project title: Swarm Project A')
    fireEvent.click(screen.getByTitle('Morgan'))
    fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), { target: { value: '/swarm deferred answer' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/openswarm/writing-partner')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Swarm Project B' }))
    await screen.findByLabelText('Project title: Swarm Project B')
    pending.resolve({
      message: 'STALE SWARM RESPONSE FROM PROJECT A',
      memoryReceipt: { revision: 91, status: 'available', citations: [], conflictIds: [] },
    })

    await waitFor(() => expect(screen.getByPlaceholderText('Message Morgan…')).toBeEnabled())
    expect(screen.queryByText('STALE SWARM RESPONSE FROM PROJECT A')).not.toBeInTheDocument()
    const persistedB = fetchMock.mock.calls
      .filter(([url, init]) => String(url).includes(`/projects/${storedB.id}`) && init?.method === 'PUT')
      .map(([, init]) => String(init?.body))
    expect(persistedB.join('\n')).not.toContain('STALE SWARM RESPONSE FROM PROJECT A')
  })
})
