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
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Private Writer List'],
      directors: ['Private Director List'],
      filmsAndShows: ['Private Film List'],
      scenesAndLines: ['Private Scene List'],
      notes: 'Measured, humane, precise.',
    },
    characterInstincts: {
      drawnTo: ['competent people with private grief'],
      rejects: ['empty cynicism'],
      notes: 'Characters reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline then draft',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

function openRailAndSend(text: string) {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))
  fireEvent.click(screen.getByTitle('Morgan'))
  fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), {
    target: { value: text },
  })
  fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })
}

describe('App Zoe persona capability routing', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
  })

  it('routes @Zoe research intent to persona capability and stores only final Zoe response plus receipt', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        finalMessage: 'Use the gate as a threshold into layered jurisdiction. [Archive]',
        receipt: {
          schemaVersion: 1,
          taskKind: 'research_world_context',
          personaId: 'zoe',
          startedAt: '2026-05-14T20:00:00.000Z',
          completedAt: '2026-05-14T20:00:01.000Z',
          durationMs: 1000,
          status: 'ok',
          contextChips: [],
          voiceProfile: { included: true, slice: 'world_context' },
          missingSurfaces: ['logline', 'synopsis', 'storyBible', 'characters'],
          sources: [{ label: 'Archive', citedInFinal: true }],
          memory: { revision: 0, status: 'disabled', citations: [], conflictIds: [] },
        },
        rawTaskBody: 'RAW TASK BODY SHOULD NOT BE RENDERED',
      }),
    }))

    openRailAndSend('@Zoe research the construction period of Damascus Gate')

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/persona-capability/run',
        expect.objectContaining({ method: 'POST' })
      )
    })

    const capabilityCall = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/persona-capability/run')
    const body = JSON.parse(String(capabilityCall?.[1]?.body))
    expect(body.personaId).toBe('zoe')
    expect(body.projectId).toBeUndefined()
    expect(body.taskKind).toBe('research_world_context')
    expect(body.voiceProfile.slice).toBe('world_context')
    expect(JSON.stringify(body.voiceProfile)).not.toContain('subtext before explanation')
    expect(JSON.stringify(body.voiceProfile)).not.toContain('Private Writer List')

    expect(await screen.findByText('Morgan (@Zoe)')).toBeInTheDocument()
    expect(screen.getByText('Use the gate as a threshold into layered jurisdiction. [Archive]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /world-context research receipt/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /world-context research receipt/i }))
    expect(screen.getByText(/project memory disabled/i)).toBeInTheDocument()
    expect(screen.queryByText('RAW TASK BODY SHOULD NOT BE RENDERED')).not.toBeInTheDocument()
  })

  it('keeps non-research @Zoe requests on the normal wp-chat path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Zoe direct answer.', suggestions: [],
        memoryReceipt: { revision: 61, status: 'available', citations: [], conflictIds: [] },
      }),
    }))

    openRailAndSend('@Zoe give me color for this gate scene')

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/wp-chat',
        expect.objectContaining({ method: 'POST' })
      )
    })

    // No capability call was made — the request stayed on wp-chat. (Other ambient
    // fetches, e.g. Project Meeting standings on Home, are allowed.)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/persona-capability'))).toBe(false)
    expect(await screen.findByText('Zoe direct answer.')).toBeInTheDocument()
    expect(screen.getByText(/project memory revision 61/i)).toBeInTheDocument()
  })

  it('sends Zoe capability the active stable projectId for a folder-backed project', async () => {
    const state = defaultProjectState()
    state.meta.title = 'Zoe Folder Project'
    const stored = { id: 'zoe-folder-project-1', createdAt: 1, updatedAt: 2, state }
    const ref = {
      kind: 'server', id: stored.id, packageName: 'Zoe Folder Project.writeros',
      summary: { id: stored.id, title: state.meta.title, createdAt: 1, updatedAt: 2 },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') return { ok: true, status: 200, json: async () => ({ enabled: true, label: 'WriterOS Projects', sessionToken: 'session' }) }
      if (url === '/api/project-library/projects') return { ok: true, status: 200, json: async () => ({ entries: [{ status: 'ready', ref, warnings: [] }] }) }
      if (url === `/api/project-library/projects/${stored.id}`) return { ok: true, status: 200, json: async () => ({ result: { ok: true, project: stored, warnings: [] } }) }
      if (url === '/api/persona-capability/run') return {
        ok: true, status: 200,
        json: async () => ({
          status: 'ok', finalMessage: 'Folder-grounded Zoe response.',
          receipt: {
            schemaVersion: 1, taskKind: 'research_world_context', personaId: 'zoe',
            startedAt: '2026-08-14T12:00:00.000Z', completedAt: '2026-08-14T12:00:01.000Z', durationMs: 1000,
            status: 'ok', contextChips: [], voiceProfile: { included: false }, missingSurfaces: [], sources: [],
            memory: { revision: 81, status: 'available', citations: [], conflictIds: [] },
          },
        }),
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Zoe Folder Project' }))
    await screen.findByLabelText('Project title: Zoe Folder Project')
    fireEvent.click(screen.getByTitle('Morgan'))
    fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), { target: { value: '@Zoe research the harbor archives' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/persona-capability/run')).toBe(true))
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/persona-capability/run')
    expect(JSON.parse(String(call?.[1]?.body)).projectId).toBe(stored.id)
  })

  it('ignores a deferred Zoe capability response after switching from folder project A to B', async () => {
    const stateA = defaultProjectState(); stateA.meta.title = 'Zoe Project A'
    const stateB = defaultProjectState(); stateB.meta.title = 'Zoe Project B'
    const storedA = { id: 'zoe-project-a', createdAt: 1, updatedAt: 2, state: stateA }
    const storedB = { id: 'zoe-project-b', createdAt: 3, updatedAt: 4, state: stateB }
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
      if (url === '/api/persona-capability/run') return { ok: true, status: 200, json: async () => pending.promise }
      if (init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true }) }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Zoe Project A' }))
    await screen.findByLabelText('Project title: Zoe Project A')
    fireEvent.click(screen.getByTitle('Morgan'))
    fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), { target: { value: '@Zoe research a deferred archive question' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/persona-capability/run')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Zoe Project B' }))
    await screen.findByLabelText('Project title: Zoe Project B')
    pending.resolve({
      status: 'ok', finalMessage: 'STALE ZOE RESPONSE FROM PROJECT A',
      receipt: {
        schemaVersion: 1, taskKind: 'research_world_context', personaId: 'zoe',
        startedAt: '2026-08-14T12:00:00.000Z', completedAt: '2026-08-14T12:00:01.000Z', durationMs: 1000,
        status: 'ok', contextChips: [], voiceProfile: { included: false, slice: 'none' }, missingSurfaces: [], sources: [],
        memory: { revision: 92, status: 'available', citations: [], conflictIds: [] },
      },
    })

    await waitFor(() => expect(screen.getByPlaceholderText('Message Morgan…')).toBeEnabled())
    expect(screen.queryByText('STALE ZOE RESPONSE FROM PROJECT A')).not.toBeInTheDocument()
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument()
    const persistedB = fetchMock.mock.calls
      .filter(([url, init]) => String(url).includes(`/projects/${storedB.id}`) && init?.method === 'PUT')
      .map(([, init]) => String(init?.body))
    expect(persistedB.join('\n')).not.toContain('STALE ZOE RESPONSE FROM PROJECT A')
  })
})
