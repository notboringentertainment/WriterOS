import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWriterOSProjectsFolder } from '../../client/src/lib/useWriterOSProjectsFolder'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

const storageMocks = vi.hoisted(() => ({
  createFileSystemAccessProjectStorageAdapter: vi.fn(),
  getWriterOSProjectsFolderPermission: vi.fn(),
  isFileSystemAccessSupported: vi.fn(),
  isWriterOSProjectsFolderPersistenceSupported: vi.fn(),
  loadPersistedWriterOSProjectsFolderHandle: vi.fn(),
  pickWriterOSProjectsFolder: vi.fn(),
  requestWriterOSProjectsFolderPermission: vi.fn(),
  listProjects: vi.fn(),
  readProject: vi.fn(),
  writeProject: vi.fn(),
  folderHandle: {
    kind: 'directory' as const,
    name: "Ben's Projects",
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
  },
}))

vi.mock('../../client/src/lib/projectStorage', () => ({
  DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL: 'Selected folder',
  clearPersistedWriterOSProjectsFolderHandle: vi.fn(),
  createFileSystemAccessProjectStorageAdapter: storageMocks.createFileSystemAccessProjectStorageAdapter,
  getWriterOSProjectsFolderPermission: storageMocks.getWriterOSProjectsFolderPermission,
  isFileSystemAccessSupported: storageMocks.isFileSystemAccessSupported,
  isWriterOSProjectsFolderPersistenceSupported: storageMocks.isWriterOSProjectsFolderPersistenceSupported,
  loadPersistedWriterOSProjectsFolderHandle: storageMocks.loadPersistedWriterOSProjectsFolderHandle,
  persistWriterOSProjectsFolderHandle: vi.fn(),
  pickWriterOSProjectsFolder: storageMocks.pickWriterOSProjectsFolder,
  requestWriterOSProjectsFolderPermission: storageMocks.requestWriterOSProjectsFolderPermission,
}))

describe('useWriterOSProjectsFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.isFileSystemAccessSupported.mockReturnValue(true)
    storageMocks.isWriterOSProjectsFolderPersistenceSupported.mockReturnValue(false)
    storageMocks.pickWriterOSProjectsFolder.mockResolvedValue(storageMocks.folderHandle)
    storageMocks.requestWriterOSProjectsFolderPermission.mockResolvedValue('granted')
    storageMocks.getWriterOSProjectsFolderPermission.mockResolvedValue('granted')
    storageMocks.listProjects.mockRejectedValue(new Error('scan failed'))
    storageMocks.readProject.mockReset()
    storageMocks.writeProject.mockReset()
    storageMocks.createFileSystemAccessProjectStorageAdapter.mockReturnValue({
      kind: 'file-system-access',
      label: "Ben's Projects",
      defaultFolderLabel: 'Selected folder',
      listProjects: storageMocks.listProjects,
      readProject: storageMocks.readProject,
      writeProject: storageMocks.writeProject,
    })
  })

  it('refreshes the selected folder after a scan error instead of reopening the picker', async () => {
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    expect(result.current.status).toBe('error')
    expect(storageMocks.pickWriterOSProjectsFolder).toHaveBeenCalledTimes(1)
    expect(storageMocks.listProjects).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.refreshFolder()
    })

    expect(storageMocks.pickWriterOSProjectsFolder).toHaveBeenCalledTimes(1)
    expect(storageMocks.requestWriterOSProjectsFolderPermission).toHaveBeenCalledTimes(2)
    expect(storageMocks.listProjects).toHaveBeenCalledTimes(2)
  })

  it('opens a discovered file-backed project through its package ref', async () => {
    const state = defaultProjectState()
    state.meta.title = 'Harbor Lights'
    const project: StoredProject = {
      id: 'folder-project-1',
      createdAt: 1000,
      updatedAt: 2000,
      state,
    }
    const ref = {
      id: 'folder-project-1',
      packageName: 'Harbor Lights (folderpr).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'folder-project-1',
        title: 'Harbor Lights',
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'folder-project-1',
        title: 'Harbor Lights',
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }
    storageMocks.listProjects.mockResolvedValue([{ status: 'ready', ref, warnings: [] }])
    storageMocks.readProject.mockResolvedValue({
      ok: true,
      manifest: ref.manifest,
      project,
      warnings: ['script/script.writeros.html is missing; using a blank script.'],
    })
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let openedProject
    await act(async () => {
      openedProject = await result.current.openProject('folder-project-1')
    })

    expect(storageMocks.readProject).toHaveBeenCalledWith(ref)
    expect(openedProject).toMatchObject({
      project,
      packageName: 'Harbor Lights (folderpr).writeros',
      warnings: ['script/script.writeros.html is missing; using a blank script.'],
    })
  })

  it('hydrates archived projects during the initial folder scan', async () => {
    const activeRef = {
      id: 'folder-project-1',
      packageName: 'Harbor Lights (folderpr).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'folder-project-1',
        title: 'Harbor Lights',
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'folder-project-1',
        title: 'Harbor Lights',
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }
    const archivedRef = {
      id: 'folder-project-archived',
      packageName: 'Old Draft (folderar).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'folder-project-archived',
        title: 'Old Draft',
        createdAt: 500,
        updatedAt: 600,
        format: 'feature' as const,
        sceneCount: 0,
        archivedAt: '2026-05-25T00:00:00.000Z',
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'folder-project-archived',
        title: 'Old Draft',
        format: 'feature' as const,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        openedAt: '2026-04-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }
    storageMocks.listProjects.mockResolvedValue([
      { status: 'ready', ref: activeRef, warnings: [] },
      { status: 'ready', ref: archivedRef, warnings: [], archived: true },
    ])
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    expect(result.current.projects).toMatchObject([
      { id: 'folder-project-1', packageName: 'Harbor Lights (folderpr).writeros' },
    ])
    expect(result.current.archivedProjects).toMatchObject([
      { id: 'folder-project-archived', packageName: 'Old Draft (folderar).writeros' },
    ])
  })

  it('surfaces an error when a file-backed project disappears before open', async () => {
    storageMocks.listProjects.mockResolvedValue([])
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    await act(async () => {
      await expect(result.current.openProject('missing-project')).rejects.toThrow(
        'That WriterOS project package is no longer available in the selected folder.',
      )
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe(
      'That WriterOS project package is no longer available in the selected folder.',
    )
  })

  it('writes an opened file-backed project through the existing package ref', async () => {
    const state = defaultProjectState()
    state.meta.title = 'Harbor Lights Revised'
    const project: StoredProject = {
      id: 'folder-project-1',
      createdAt: 1000,
      updatedAt: 3000,
      state,
    }
    const ref = {
      id: 'folder-project-1',
      packageName: 'Harbor Lights (folderpr).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'folder-project-1',
        title: 'Harbor Lights',
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'folder-project-1',
        title: 'Harbor Lights',
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }
    const writtenRef = {
      ...ref,
      summary: {
        ...ref.summary,
        title: 'Harbor Lights Revised',
        updatedAt: 3000,
      },
    }
    storageMocks.listProjects.mockResolvedValue([{ status: 'ready', ref, warnings: [] }])
    storageMocks.writeProject.mockResolvedValue(writtenRef)
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let writtenProject
    await act(async () => {
      writtenProject = await result.current.writeProject(project)
    })

    expect(storageMocks.writeProject).toHaveBeenCalledWith(project, ref)
    expect(writtenProject).toMatchObject({
      id: 'folder-project-1',
      packageName: 'Harbor Lights (folderpr).writeros',
      summary: { title: 'Harbor Lights Revised' },
    })
  })
})
