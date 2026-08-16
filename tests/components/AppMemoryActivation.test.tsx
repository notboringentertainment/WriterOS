import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

// Reproduces the owner-blocking acceptance bug: shared project memory only
// ever activates for a genuinely server-backed project (storage kind
// 'server', WRITEROS_PROJECTS_ROOT), but the memory UI was keyed to the
// browser File System Access mode instead. Covers all three storage modes
// App.tsx can be in: server (memory active), browser-folder (browserOnly
// notice), and pure browser (browserOnly notice) — with the Memory button
// visible whenever a project is open in every mode.
const mocks = vi.hoisted(() => ({
  folderState: {
    status: 'disconnected' as string,
    label: null as string | null,
    defaultFolderLabel: 'Selected folder',
    fileSystemAccessSupported: true,
    folderPersistenceSupported: true,
    projects: [] as unknown[],
    archivedProjects: [] as unknown[],
    corruptProjects: [] as unknown[],
    errorMessage: null as string | null,
    chooseFolder: vi.fn(),
    refreshFolder: vi.fn(),
    forgetFolder: vi.fn(),
    openProject: vi.fn(),
    writeProject: vi.fn(),
    deleteProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    showProjectInFolder: vi.fn(),
    duplicateProject: vi.fn(),
    runMigration: vi.fn(),
  },
}))

vi.mock('../../client/src/lib/useWriterOSProjectsFolder', () => ({
  useWriterOSProjectsFolder: () => mocks.folderState,
}))

// vi.mock calls above are hoisted above this import, so App picks up the
// mocked folder hook.
import App from '../../client/src/App'

function makeStoredProject(id: string, title: string): StoredProject {
  const state = defaultProjectState()
  state.meta.title = title
  return { id, createdAt: 1, updatedAt: 2, state }
}

describe('App memory activation by storage kind', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
    mocks.folderState.status = 'disconnected'
    mocks.folderState.label = null
    mocks.folderState.projects = []
    mocks.folderState.openProject = vi.fn()
  })

  it('activates memory for a server-backed project: the hook receives the project id and loads the surface', async () => {
    const stored = makeStoredProject('server-project-1', 'Server Backed Project')
    const ref = {
      kind: 'server', id: stored.id, packageName: 'Server Backed Project.writeros',
      summary: { id: stored.id, title: stored.state.meta.title, createdAt: 1, updatedAt: 2 },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ enabled: true, label: 'WriterOS Projects', sessionToken: 'session-token' }) }
      }
      if (url === '/api/project-library/projects') {
        return { ok: true, status: 200, json: async () => ({ entries: [{ status: 'ready', ref, warnings: [] }] }) }
      }
      if (url === `/api/project-library/projects/${stored.id}`) {
        return { ok: true, status: 200, json: async () => ({ result: { ok: true, project: stored, warnings: [] } }) }
      }
      if (url === `/api/projects/${stored.id}/memory/snapshot`) {
        return { ok: true, status: 200, json: async () => ({ snapshot: { schemaVersion: 1, projectId: stored.id, revision: 1, records: [], conflicts: [] } }) }
      }
      if (url === `/api/project-memory/${stored.id}/analysis-queue`) {
        return { ok: true, status: 200, json: async () => ({ items: [] }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Server Backed Project' }))
    await screen.findByLabelText('Project title: Server Backed Project')

    fireEvent.click(screen.getByRole('button', { name: 'Memory' }))

    expect(await screen.findByRole('tablist', { name: 'Memory views' })).toBeInTheDocument()
    expect(screen.queryByText('Shared project memory requires project folder storage.')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === `/api/projects/${stored.id}/memory/snapshot`)).toBe(true))
  })

  it('shows the browserOnly notice for a browser File System Access folder project, and the Memory button still appears', async () => {
    const stored = makeStoredProject('real-folder-project-1', 'Real Folder Project')
    mocks.folderState.status = 'ready'
    mocks.folderState.label = 'My Scripts'
    mocks.folderState.projects = [{
      id: stored.id,
      packageName: 'Real Folder Project.writeros',
      summary: { id: stored.id, title: stored.state.meta.title, createdAt: 1, updatedAt: 2 },
      warnings: [],
    }]
    mocks.folderState.openProject = vi.fn().mockResolvedValue({
      project: stored,
      packageName: 'Real Folder Project.writeros',
      warnings: [],
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/project-library/bootstrap') {
        return { ok: true, status: 200, json: async () => ({ enabled: false }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Real Folder Project' }))
    await screen.findByLabelText('Project title: Real Folder Project')

    const memoryButton = await screen.findByRole('button', { name: 'Memory' })
    fireEvent.click(memoryButton)

    expect(await screen.findByText('Shared project memory requires project folder storage.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => {
      const value = String(url)
      return value.includes('/api/project-memory/') || value.includes('/memory/snapshot')
    })).toBe(false)
  })

  it('shows the browserOnly notice for a pure browser project, with the Memory button visible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

    const memoryButton = await screen.findByRole('button', { name: 'Memory' })
    fireEvent.click(memoryButton)

    expect(await screen.findByText('Shared project memory requires project folder storage.')).toBeInTheDocument()
  })
})
