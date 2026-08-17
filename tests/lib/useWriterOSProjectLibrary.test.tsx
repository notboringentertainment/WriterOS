import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

const mocks = vi.hoisted(() => ({
  bootstrapServerProjectStorage: vi.fn(),
  listProjects: vi.fn(),
  readProject: vi.fn(),
  writeProject: vi.fn(),
  removeProject: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
  showProjectInFolder: vi.fn(),
  duplicateProject: vi.fn(),
  folderState: {
    status: 'disconnected' as const,
    label: null,
    defaultFolderLabel: 'Selected folder',
    fileSystemAccessSupported: true,
    folderPersistenceSupported: true,
    projects: [],
    corruptProjects: [],
    errorMessage: null,
    chooseFolder: vi.fn(),
    refreshFolder: vi.fn(),
    forgetFolder: vi.fn(),
    archivedProjects: [],
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

vi.mock('../../client/src/lib/serverProjectStorage', () => ({
  bootstrapServerProjectStorage: mocks.bootstrapServerProjectStorage,
}))

vi.mock('../../client/src/lib/useWriterOSProjectsFolder', () => ({
  useWriterOSProjectsFolder: () => mocks.folderState,
}))

import { useWriterOSProjectLibrary } from '../../client/src/lib/useWriterOSProjectLibrary'

function makeProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'The Salt Line'
  return {
    id: 'server-project-1234',
    createdAt: 1000,
    updatedAt: 2000,
    state,
  }
}

function makeRef(project = makeProject()) {
  return {
    kind: 'server' as const,
    id: project.id,
    packageName: 'The Salt Line (serverpr).writeros',
    summary: {
      id: project.id,
      title: project.state.meta.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  }
}

function serverAdapter() {
  return {
    kind: 'server' as const,
    label: 'WriterOS Projects',
    defaultFolderLabel: 'WriterOS Projects',
    capabilities: {
      removeProject: false,
      archiveProject: false,
      restoreProject: false,
      showProjectInFolder: false,
      duplicateProject: false,
    },
    listProjects: mocks.listProjects,
    readProject: mocks.readProject,
    writeProject: mocks.writeProject,
    removeProject: mocks.removeProject,
    archiveProject: mocks.archiveProject,
    restoreProject: mocks.restoreProject,
    showProjectInFolder: mocks.showProjectInFolder,
    duplicateProject: mocks.duplicateProject,
  }
}

describe('useWriterOSProjectLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listProjects.mockResolvedValue([])
    mocks.bootstrapServerProjectStorage.mockResolvedValue(serverAdapter())
  })

  it('uses existing folder hook when server library is disabled', async () => {
    mocks.bootstrapServerProjectStorage.mockResolvedValue(null)
    const { result } = renderHook(() => useWriterOSProjectLibrary())

    await waitFor(() => expect(result.current.source).toBe('folder'))
    expect(result.current.status).toBe('disconnected')
    expect(result.current.chooseFolder).toBe(mocks.folderState.chooseFolder)
  })

  it('loads server projects as primary storage without invoking folder picker', async () => {
    const project = makeProject()
    const ref = makeRef(project)
    mocks.listProjects.mockResolvedValue([{ status: 'ready', ref, warnings: [] }])
    const { result } = renderHook(() => useWriterOSProjectLibrary())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.source).toBe('server')
    expect(result.current.label).toBe('WriterOS Projects')
    expect(result.current.projects).toMatchObject([{ id: project.id, packageName: ref.packageName }])
    expect(result.current.capabilities).toEqual(serverAdapter().capabilities)
    expect(mocks.folderState.chooseFolder).not.toHaveBeenCalled()
  })

  it('opens and saves server projects through adapter refs', async () => {
    const project = makeProject()
    const ref = makeRef(project)
    mocks.listProjects.mockResolvedValue([{ status: 'ready', ref, warnings: [] }])
    mocks.readProject.mockResolvedValue({
      ok: true,
      manifest: { format: 'writeros-project', version: 1, projectId: project.id },
      project,
      warnings: ['older package'],
    })
    mocks.writeProject.mockResolvedValue(ref)
    const { result } = renderHook(() => useWriterOSProjectLibrary())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await expect(result.current.openProject(project.id)).resolves.toEqual({
      project,
      packageName: ref.packageName,
      warnings: ['older package'],
    })
    await act(async () => {
      await expect(result.current.writeProject(project)).resolves.toMatchObject({
        id: project.id,
        packageName: ref.packageName,
      })
    })
    expect(mocks.readProject).toHaveBeenCalledWith(ref)
    expect(mocks.writeProject).toHaveBeenCalledWith(project, ref)
  })

  it('falls back to folder hook when server bootstrap fails', async () => {
    mocks.bootstrapServerProjectStorage.mockRejectedValue(new Error('server unavailable'))
    const { result } = renderHook(() => useWriterOSProjectLibrary())

    await waitFor(() => expect(result.current.source).toBe('folder'))
    expect(result.current.status).toBe('disconnected')
  })
})
