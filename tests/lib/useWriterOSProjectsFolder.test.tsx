import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWriterOSProjectsFolder } from '../../client/src/lib/useWriterOSProjectsFolder'

const storageMocks = vi.hoisted(() => ({
  createFileSystemAccessProjectStorageAdapter: vi.fn(),
  getWriterOSProjectsFolderPermission: vi.fn(),
  isFileSystemAccessSupported: vi.fn(),
  isWriterOSProjectsFolderPersistenceSupported: vi.fn(),
  loadPersistedWriterOSProjectsFolderHandle: vi.fn(),
  pickWriterOSProjectsFolder: vi.fn(),
  requestWriterOSProjectsFolderPermission: vi.fn(),
  listProjects: vi.fn(),
  folderHandle: {
    kind: 'directory' as const,
    name: 'WriterOS Projects',
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
  },
}))

vi.mock('../../client/src/lib/projectStorage', () => ({
  DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL: '~/WriterOS Projects',
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
    storageMocks.createFileSystemAccessProjectStorageAdapter.mockReturnValue({
      kind: 'file-system-access',
      label: 'WriterOS Projects',
      defaultFolderLabel: '~/WriterOS Projects',
      listProjects: storageMocks.listProjects,
      readProject: vi.fn(),
      writeProject: vi.fn(),
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
})
