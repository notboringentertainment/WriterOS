import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

// App-level regression coverage for shared project memory across all three
// storage modes App.tsx can be in: a genuinely server-backed project
// (WRITEROS_PROJECTS_ROOT) should activate memory end to end; a browser
// File System Access folder project and a pure browser project should both
// show the browserOnly notice, with the Memory button visible whenever a
// project is open in every mode. This closes an App-level coverage gap
// flagged in final review — a prior acceptance-pass report of this bug
// turned out to be caused by a stale server (old build, no memory feature)
// squatting the port during manual testing, not by App.tsx's actual
// gating; against the real worktree server, server-mode memory already
// works, so these tests assert and pin CURRENT behavior rather than drive
// a production-code change.
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

  // KNOWN GAP, not fixed here (see acceptance-fix-report.md): App.tsx keys
  // activeFolderProjectId to storage kind 'folder' alone, which a real
  // browser File System Access folder project and a genuinely server-backed
  // project both currently set — so this mode attempts a real memory
  // session bootstrap instead of short-circuiting to the browserOnly
  // notice. With WRITEROS_PROJECTS_ROOT disabled that bootstrap fails, and
  // the surface shows the session-unavailable message (now with the
  // clarified remedy) instead of "Shared project memory requires project
  // folder storage.". This test pins that CURRENT behavior; it does not
  // assert the intended target behavior, and no production code was changed
  // to make it pass, per instruction to report rather than fix.
  it('currently shows the session-unavailable message (not the browserOnly notice) for a browser File System Access folder project; the Memory button still appears', async () => {
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

    expect(await screen.findByText(
      'WriterOS could not verify this session for project memory. Check that the server project library is enabled (WRITEROS_PROJECTS_ROOT) and reload.',
    )).toBeInTheDocument()
    expect(screen.queryByText('Shared project memory requires project folder storage.')).not.toBeInTheDocument()
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
