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
  removeProject: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
  showProjectInFolder: vi.fn(),
  duplicateProject: vi.fn(),
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
    storageMocks.removeProject.mockReset()
    storageMocks.archiveProject.mockReset()
    storageMocks.restoreProject.mockReset()
    storageMocks.showProjectInFolder.mockReset()
    storageMocks.duplicateProject.mockReset()
    storageMocks.createFileSystemAccessProjectStorageAdapter.mockReturnValue({
      kind: 'file-system-access',
      label: "Ben's Projects",
      defaultFolderLabel: 'Selected folder',
      listProjects: storageMocks.listProjects,
      readProject: storageMocks.readProject,
      writeProject: storageMocks.writeProject,
      removeProject: storageMocks.removeProject,
      archiveProject: storageMocks.archiveProject,
      restoreProject: storageMocks.restoreProject,
      showProjectInFolder: storageMocks.showProjectInFolder,
      duplicateProject: storageMocks.duplicateProject,
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

  it('runMigration writes each unmigrated project via adapter and refreshes the project list', async () => {
    // Reset before queueing once-values so previously-queued resolutions
    // from sibling tests cannot bleed across.
    storageMocks.listProjects.mockReset()
    const state = defaultProjectState()
    state.meta.title = 'Migration Project'
    const projectOne: StoredProject = {
      id: 'p1',
      createdAt: 1000,
      updatedAt: 2000,
      state,
    }
    const projectTwo: StoredProject = {
      id: 'p2',
      createdAt: 1500,
      updatedAt: 2500,
      state,
    }

    const buildRef = (id: string, packageName: string) => ({
      id,
      packageName,
      handle: storageMocks.folderHandle,
      summary: {
        id,
        title: packageName.replace(/\.writeros$/, ''),
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: id,
        title: packageName.replace(/\.writeros$/, ''),
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    })

    const refOne = buildRef('p1', 'Migration Project (p1xxxxx).writeros')
    const refTwo = buildRef('p2', 'Migration Project (p2xxxxx).writeros')

    // Initial scan after chooseFolder returns nothing on disk.
    storageMocks.listProjects.mockResolvedValueOnce([])
    // First write resolves to refOne; second write resolves to refTwo.
    storageMocks.writeProject.mockResolvedValueOnce(refOne)
    storageMocks.writeProject.mockResolvedValueOnce(refTwo)
    // Final refresh after migration returns both newly-written packages.
    storageMocks.listProjects.mockResolvedValueOnce([
      { status: 'ready', ref: refOne, warnings: [] },
      { status: 'ready', ref: refTwo, warnings: [] },
    ])

    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let migrationResults: any[] = []
    await act(async () => {
      migrationResults = await result.current.runMigration([projectOne, projectTwo])
    })

    expect(migrationResults).toHaveLength(2)
    expect(migrationResults.every((r: any) => r.ok)).toBe(true)
    expect(storageMocks.writeProject).toHaveBeenNthCalledWith(1, projectOne)
    expect(storageMocks.writeProject).toHaveBeenNthCalledWith(2, projectTwo)
    expect(result.current.label).toBe("Ben's Projects")
    expect(result.current.projects).toMatchObject([
      { id: 'p1', packageName: 'Migration Project (p1xxxxx).writeros' },
      { id: 'p2', packageName: 'Migration Project (p2xxxxx).writeros' },
    ])
    expect(result.current.status).toBe('ready')
  })

  it('runMigration surfaces permission-denied as a failure result per unmigrated project', async () => {
    storageMocks.listProjects.mockReset()
    const state = defaultProjectState()
    const projectOne: StoredProject = {
      id: 'p1',
      createdAt: 1000,
      updatedAt: 2000,
      state,
    }
    const projectAlreadyMigrated: StoredProject = {
      id: 'p2',
      createdAt: 1500,
      updatedAt: 2500,
      state,
      migratedToFolder: {
        folderLabel: 'Old Folder',
        packageName: 'Old (p2xxxxx).writeros',
        migratedAt: '2026-05-01T00:00:00.000Z',
      },
    }

    storageMocks.listProjects.mockResolvedValueOnce([])

    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    // After the folder is connected, future permission requests are denied.
    storageMocks.requestWriterOSProjectsFolderPermission.mockResolvedValue('denied')

    let migrationResults: any[] = []
    await act(async () => {
      migrationResults = await result.current.runMigration([projectOne, projectAlreadyMigrated])
    })

    expect(migrationResults).toHaveLength(1)
    expect(migrationResults[0]).toMatchObject({ projectId: 'p1', ok: false })
    expect(migrationResults[0].error).toMatch(/permission/i)
    expect(storageMocks.writeProject).not.toHaveBeenCalled()
  })

  it('runMigration maps adapter construction failures to project failure results', async () => {
    storageMocks.listProjects.mockReset()
    storageMocks.createFileSystemAccessProjectStorageAdapter.mockReset()
    const state = defaultProjectState()
    const projectOne: StoredProject = {
      id: 'p1',
      createdAt: 1000,
      updatedAt: 2000,
      state,
    }
    const adapter = {
      kind: 'file-system-access',
      label: "Ben's Projects",
      defaultFolderLabel: 'Selected folder',
      listProjects: storageMocks.listProjects,
      readProject: storageMocks.readProject,
      writeProject: storageMocks.writeProject,
    }

    storageMocks.listProjects.mockResolvedValueOnce([])
    storageMocks.createFileSystemAccessProjectStorageAdapter
      .mockReturnValueOnce(adapter)
      .mockImplementationOnce(() => {
        throw new Error('adapter unavailable')
      })

    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let migrationResults: any[] = []
    await act(async () => {
      migrationResults = await result.current.runMigration([projectOne])
    })

    expect(migrationResults).toEqual([
      { projectId: 'p1', ok: false, error: 'adapter unavailable' },
    ])
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('adapter unavailable')
    expect(storageMocks.writeProject).not.toHaveBeenCalled()
  })

  it('runMigration preserves successful write results when the post-migration refresh fails', async () => {
    storageMocks.listProjects.mockReset()
    const state = defaultProjectState()
    const projectOne: StoredProject = {
      id: 'p1',
      createdAt: 1000,
      updatedAt: 2000,
      state,
    }
    const projectAlreadyMigrated: StoredProject = {
      id: 'p2',
      createdAt: 1500,
      updatedAt: 2500,
      state,
      migratedToFolder: {
        folderLabel: 'Old Folder',
        packageName: 'Old (p2xxxxx).writeros',
        migratedAt: '2026-05-01T00:00:00.000Z',
      },
    }

    const refOne = {
      id: 'p1',
      packageName: 'Migration Project (p1xxxxx).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'p1',
        title: 'Migration Project',
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'p1',
        title: 'Migration Project',
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }

    // Initial scan after chooseFolder returns nothing on disk.
    storageMocks.listProjects.mockResolvedValueOnce([])
    // The migration write itself succeeds.
    storageMocks.writeProject.mockResolvedValueOnce(refOne)
    // The post-migration refresh listProjects() throws (e.g., transient
    // permission revoke after the migration write). Critically, the
    // successful write above must NOT be discarded — projects are already
    // on disk and the caller still needs to stamp markedToFolder markers.
    storageMocks.listProjects.mockRejectedValueOnce(new Error('disk read failed during refresh'))

    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let migrationResults: any[] = []
    await act(async () => {
      migrationResults = await result.current.runMigration([projectOne, projectAlreadyMigrated])
    })

    // Hook surfaces the refresh failure for the UI.
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).not.toBeNull()
    expect(result.current.errorMessage).toMatch(/disk read failed during refresh/)
    // Pre-migrated project should NOT appear in results; only the unmigrated one.
    // AND that result must reflect the successful write — otherwise the caller
    // skips stamping the migratedToFolder marker and the writer ends up with
    // duplicate packages on the next session.
    expect(migrationResults).toHaveLength(1)
    expect(migrationResults[0]).toMatchObject({
      projectId: 'p1',
      ok: true,
      packageName: 'Migration Project (p1xxxxx).writeros',
      folderLabel: "Ben's Projects",
    })
    expect(migrationResults[0].migratedAt).toEqual(expect.any(String))
  })

  it('runMigration surfaces mixed per-project failures without hiding successful writes', async () => {
    storageMocks.listProjects.mockReset()
    const stateOne = defaultProjectState()
    stateOne.meta.title = 'Successful Move'
    const stateTwo = defaultProjectState()
    stateTwo.meta.title = 'Stuck Draft'
    const projectOne: StoredProject = {
      id: 'p1',
      createdAt: 1000,
      updatedAt: 2000,
      state: stateOne,
    }
    const projectTwo: StoredProject = {
      id: 'p2',
      createdAt: 1500,
      updatedAt: 2500,
      state: stateTwo,
    }
    const refOne = {
      id: 'p1',
      packageName: 'Successful Move (p1xxxxx).writeros',
      handle: storageMocks.folderHandle,
      summary: {
        id: 'p1',
        title: 'Successful Move',
        createdAt: 1000,
        updatedAt: 2000,
        format: 'feature' as const,
        sceneCount: 0,
      },
      manifest: {
        schemaVersion: 1 as const,
        projectId: 'p1',
        title: 'Successful Move',
        format: 'feature' as const,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        openedAt: '2026-05-02T00:00:00.000Z',
        sourceImport: null,
        appVersion: '0.2.0',
      },
    }

    storageMocks.listProjects.mockResolvedValueOnce([])
    storageMocks.writeProject
      .mockResolvedValueOnce(refOne)
      .mockRejectedValueOnce(new Error('disk full'))
    storageMocks.listProjects.mockResolvedValueOnce([
      { status: 'ready', ref: refOne, warnings: [] },
    ])

    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let migrationResults: any[] = []
    await act(async () => {
      migrationResults = await result.current.runMigration([projectOne, projectTwo])
    })

    expect(migrationResults).toEqual([
      expect.objectContaining({ projectId: 'p1', ok: true }),
      { projectId: 'p2', ok: false, error: 'disk full' },
    ])
    expect(result.current.status).toBe('ready')
    expect(result.current.errorMessage).toContain('1 browser project failed to migrate')
    expect(result.current.errorMessage).toContain('Stuck Draft: disk full')
    expect(result.current.projects).toMatchObject([
      { id: 'p1', packageName: 'Successful Move (p1xxxxx).writeros' },
    ])
  })

  it('updates an opened file-backed project from the adapter returned package ref', async () => {
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
      packageName: 'Harbor Lights Revised (folderpr).writeros',
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
      packageName: 'Harbor Lights Revised (folderpr).writeros',
      summary: { title: 'Harbor Lights Revised' },
    })
    expect(result.current.projects).toMatchObject([
      { id: 'folder-project-1', packageName: 'Harbor Lights Revised (folderpr).writeros' },
    ])
  })

  it('showProjectInFolder forwards the tracked package ref and surfaces unsupported browser show-in-folder', async () => {
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
    storageMocks.showProjectInFolder.mockResolvedValue({
      ok: false,
      reason: 'unsupported',
      message: 'This browser build cannot show project packages in your system file browser yet.',
    })
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let showResult
    await act(async () => {
      showResult = await result.current.showProjectInFolder('folder-project-1')
    })

    expect(storageMocks.showProjectInFolder).toHaveBeenCalledWith(ref)
    expect(showResult).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(result.current.errorMessage).toBe('This browser build cannot show project packages in your system file browser yet.')
  })

  it('duplicateProject forwards the tracked package ref and prepends the duplicated project', async () => {
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
    const duplicatedRef = {
      ...ref,
      id: 'folder-project-copy',
      packageName: 'Harbor Lights Copy (folderco).writeros',
      summary: {
        ...ref.summary,
        id: 'folder-project-copy',
        title: 'Harbor Lights Copy',
        createdAt: 3000,
        updatedAt: 3000,
      },
      manifest: {
        ...ref.manifest,
        projectId: 'folder-project-copy',
        title: 'Harbor Lights Copy',
      },
    }
    storageMocks.listProjects.mockResolvedValue([{ status: 'ready', ref, warnings: [] }])
    storageMocks.duplicateProject.mockResolvedValue({
      ok: true,
      ref: duplicatedRef,
      project: {
        id: 'folder-project-copy',
        createdAt: 3000,
        updatedAt: 3000,
        state: defaultProjectState(),
      },
      warnings: [],
    })
    const { result } = renderHook(() => useWriterOSProjectsFolder())

    await act(async () => {
      await result.current.chooseFolder()
    })

    let duplicateResult
    await act(async () => {
      duplicateResult = await result.current.duplicateProject('folder-project-1')
    })

    expect(storageMocks.duplicateProject).toHaveBeenCalledWith(ref)
    expect(duplicateResult).toMatchObject({ ok: true, ref: duplicatedRef })
    expect(result.current.projects).toMatchObject([
      { id: 'folder-project-copy', packageName: 'Harbor Lights Copy (folderco).writeros' },
      { id: 'folder-project-1', packageName: 'Harbor Lights (folderpr).writeros' },
    ])
    expect(result.current.errorMessage).toBeNull()
  })
})
