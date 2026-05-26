import { describe, expect, it } from 'vitest'
import {
  createFileSystemAccessProjectStorageAdapter,
  WRITEROS_ARCHIVE_SUBFOLDER_NAME,
  type WriterOSFileSystemDirectoryHandle,
  type WriterOSFileSystemFileHandle,
  type WriterOSFileSystemHandle,
  type WriterOSFileSystemWritable,
} from '../../client/src/lib/projectStorage'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

class FakeWritable implements WriterOSFileSystemWritable {
  constructor(private readonly writeContent: (value: string) => void) {}

  async write(data: string): Promise<void> {
    this.writeContent(data)
  }

  async close(): Promise<void> {}
}

class FakeFileHandle implements WriterOSFileSystemFileHandle {
  readonly kind = 'file' as const

  constructor(readonly name: string, private content = '') {}

  async getFile(): Promise<File> {
    return {
      text: async () => this.content,
    } as File
  }

  async createWritable(): Promise<WriterOSFileSystemWritable> {
    return new FakeWritable(value => {
      this.content = value
    })
  }
}

class FakeDirectoryHandle implements WriterOSFileSystemDirectoryHandle {
  readonly kind = 'directory' as const
  private readonly children = new Map<string, WriterOSFileSystemHandle>()

  constructor(readonly name: string) {}

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<WriterOSFileSystemFileHandle> {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind === 'file') return existing
      throw new Error(`${name} is not a file`)
    }
    if (!options.create) throw Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' })

    const next = new FakeFileHandle(name)
    this.children.set(name, next)
    return next
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<WriterOSFileSystemDirectoryHandle> {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind === 'directory') return existing
      throw new Error(`${name} is not a directory`)
    }
    if (!options.create) throw Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' })

    const next = new FakeDirectoryHandle(name)
    this.children.set(name, next)
    return next
  }

  async *entries(): AsyncIterableIterator<[string, WriterOSFileSystemHandle]> {
    yield* this.children.entries()
  }
}

class RemovableFakeDirectoryHandle extends FakeDirectoryHandle {
  removeAttempts: Array<{ name: string; recursive: boolean | undefined }> = []

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    this.removeAttempts.push({ name, recursive: options?.recursive })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this as any).children.delete(name)
  }
}

async function writeTextFile(root: WriterOSFileSystemDirectoryHandle, path: string, content: string) {
  const parts = path.split('/')
  let directory = root
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create: true })
  }
  const file = await directory.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await file.createWritable()
  await writable.write(content)
  await writable.close()
}

function makeStoredProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'The Salt Line'
  state.script.rawHtml = '<p data-element-type="scene-heading">EXT. BEACH - DAWN</p>'

  return {
    id: '8f4e2c9a-5c7d-4f6b-a1c2-123456789abc',
    createdAt: Date.parse('2026-05-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-05-02T11:30:00.000Z'),
    state,
  }
}

describe('File System Access project storage adapter', () => {
  it('refuses to write a package without a project id', async () => {
    const root = new FakeDirectoryHandle('WriterOS Projects')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)
    const project = { ...makeStoredProject(), id: '' }

    await expect(adapter.writeProject(project)).rejects.toThrow(
      'Cannot save a WriterOS project package without a project id.',
    )
    await expect(adapter.listProjects()).resolves.toEqual([])
  })

  it('writes, lists, and reads .writeros project packages', async () => {
    const root = new FakeDirectoryHandle('WriterOS Projects')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)

    const ref = await adapter.writeProject(makeStoredProject())
    const list = await adapter.listProjects()
    const read = await adapter.readProject(ref)

    expect(ref.packageName).toBe('The Salt Line (8f4e2c9a).writeros')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      status: 'ready',
      ref: {
        id: '8f4e2c9a-5c7d-4f6b-a1c2-123456789abc',
        packageName: 'The Salt Line (8f4e2c9a).writeros',
        summary: { title: 'The Salt Line' },
      },
    })
    expect(read.ok).toBe(true)
    if (!read.ok) throw new Error(read.error.message)
    expect(read.project.state.script.scenes[0].heading).toBe('EXT. BEACH - DAWN')
  })

  it('keeps corrupt project folders visible as corrupt list entries', async () => {
    const root = new FakeDirectoryHandle('WriterOS Projects')
    const corruptPackage = await root.getDirectoryHandle('Broken.writeros', { create: true })
    await writeTextFile(corruptPackage, 'project.json', '{not json')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)

    const list = await adapter.listProjects()

    expect(list).toEqual([
      expect.objectContaining({
        status: 'corrupt',
        packageName: 'Broken.writeros',
        error: expect.objectContaining({
          code: 'invalid-json',
          path: 'project.json',
        }),
      }),
    ])
  })

  it('renames an opened package when the project title changes', async () => {
    const root = new RemovableFakeDirectoryHandle('WriterOS Projects')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)
    const project = makeStoredProject()

    const ref = await adapter.writeProject(project)
    await writeTextFile(ref.handle, 'vault/craft-notes.md', '# keep me')
    project.state.meta.title = 'The Salt Line Revised'
    project.updatedAt = Date.parse('2026-05-03T12:00:00.000Z')

    const updatedRef = await adapter.writeProject(project, ref)
    const list = await adapter.listProjects()

    expect(updatedRef.packageName).toBe('The Salt Line Revised (8f4e2c9a).writeros')
    expect(updatedRef.handle).not.toBe(ref.handle)
    expect(root.removeAttempts).toEqual([
      { name: 'The Salt Line (8f4e2c9a).writeros', recursive: true },
    ])
    await expect(root.getDirectoryHandle('The Salt Line (8f4e2c9a).writeros')).rejects.toMatchObject({
      name: 'NotFoundError',
    })
    const vaultFile = await (await updatedRef.handle.getDirectoryHandle('vault')).getFileHandle('craft-notes.md')
    expect(await (await vaultFile.getFile()).text()).toBe('# keep me')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      status: 'ready',
      ref: {
        packageName: 'The Salt Line Revised (8f4e2c9a).writeros',
        summary: { title: 'The Salt Line Revised' },
      },
    })
  })

  it('does not rename over an existing package folder', async () => {
    const root = new RemovableFakeDirectoryHandle('WriterOS Projects')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)
    const project = makeStoredProject()
    const ref = await adapter.writeProject(project)
    await root.getDirectoryHandle('The Salt Line Revised (8f4e2c9a).writeros', { create: true })

    project.state.meta.title = 'The Salt Line Revised'

    await expect(adapter.writeProject(project, ref)).rejects.toThrow(
      'A WriterOS project package with this name already exists.',
    )
  })

  describe('removeProject (Slice 5a)', () => {
    class FakeDirectoryHandleWithRemove extends FakeDirectoryHandle {
      removeAttempts: Array<{ name: string; recursive: boolean | undefined }> = []
      removeBehavior: 'success' | 'not-found' | 'denied' | 'unknown-error' = 'success'

      async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        this.removeAttempts.push({ name, recursive: options?.recursive })
        switch (this.removeBehavior) {
          case 'success':
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(this as any).children.delete(name)
            return
          case 'not-found':
            throw Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' })
          case 'denied':
            throw Object.assign(new Error('permission denied'), { name: 'NotAllowedError' })
          case 'unknown-error':
            throw new Error('disk on fire')
        }
      }
    }

    it('returns unsupported when the directory handle has no removeEntry', async () => {
      const root = new FakeDirectoryHandle('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())

      const result = await adapter.removeProject(ref)

      expect(result).toEqual({
        ok: false,
        reason: 'unsupported',
        message: expect.stringContaining('cannot delete'),
      })
    })

    it('removes the package folder on the happy path', async () => {
      const root = new FakeDirectoryHandleWithRemove('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())

      const result = await adapter.removeProject(ref)

      expect(result).toEqual({ ok: true, folderAlreadyMissing: false })
      expect(root.removeAttempts).toEqual([
        { name: 'The Salt Line (8f4e2c9a).writeros', recursive: true },
      ])
      const list = await adapter.listProjects()
      expect(list).toHaveLength(0)
    })

    it('treats a missing folder as success (folderAlreadyMissing: true)', async () => {
      const root = new FakeDirectoryHandleWithRemove('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      root.removeBehavior = 'not-found'

      const result = await adapter.removeProject(ref)

      expect(result).toEqual({ ok: true, folderAlreadyMissing: true })
    })

    it('surfaces a permission-denied failure explicitly', async () => {
      const root = new FakeDirectoryHandleWithRemove('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      root.removeBehavior = 'denied'

      const result = await adapter.removeProject(ref)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.reason).toBe('permission-denied')
      expect(result.message).toMatch(/permission was denied/)
    })

    it('surfaces unknown errors as a generic failure', async () => {
      const root = new FakeDirectoryHandleWithRemove('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      root.removeBehavior = 'unknown-error'

      const result = await adapter.removeProject(ref)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.reason).toBe('failed')
      expect(result.message).toBe('disk on fire')
    })
  })

  describe('archive / restore folder move (Slice 5a-2)', () => {
    class FakeDirectoryHandleWithRemove extends FakeDirectoryHandle {
      removeAttempts: Array<{ name: string; recursive: boolean | undefined }> = []
      removeBehavior: 'success' | 'not-found' | 'denied' | 'unknown-error' = 'success'

      async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        this.removeAttempts.push({ name, recursive: options?.recursive })
        switch (this.removeBehavior) {
          case 'success':
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(this as any).children.delete(name)
            return
          case 'not-found':
            throw Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' })
          case 'denied':
            throw Object.assign(new Error('permission denied'), { name: 'NotAllowedError' })
          case 'unknown-error':
            throw new Error('disk on fire')
        }
      }
    }

    function makeRoot() {
      // Need removeEntry on subdirectories too. Replace the default factory
      // by patching children created via getDirectoryHandle so they are also
      // FakeDirectoryHandleWithRemove instances.
      class TreeRoot extends FakeDirectoryHandleWithRemove {
        async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<WriterOSFileSystemDirectoryHandle> {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const children: Map<string, WriterOSFileSystemHandle> = (this as any).children
          const existing = children.get(name)
          if (existing) {
            if (existing.kind === 'directory') return existing
            throw new Error(`${name} is not a directory`)
          }
          if (!options.create) throw Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' })

          const next = new TreeRoot(name)
          children.set(name, next)
          return next
        }
      }
      return new TreeRoot('WriterOS Projects')
    }

    it('archive moves a package into Archive/ and removes the original', async () => {
      const root = makeRoot()
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())

      const result = await adapter.archiveProject(ref)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('archive failed')
      expect(result.ref.packageName).toBe(ref.packageName)
      expect(result.ref.handle).not.toBe(ref.handle)

      const list = await adapter.listProjects()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({
        status: 'ready',
        archived: true,
      })
    })

    it('restore moves a package back out of Archive/ and removes the archived copy', async () => {
      const root = makeRoot()
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      const archived = await adapter.archiveProject(ref)
      if (!archived.ok) throw new Error('archive prerequisite failed')

      const result = await adapter.restoreProject(archived.ref)

      expect(result.ok).toBe(true)
      const list = await adapter.listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('ready')
      if (list[0].status !== 'ready') throw new Error('expected ready entry')
      expect(list[0].archived).toBeFalsy()
    })

    it('surfaces permission-denied as an explicit failure during archive', async () => {
      const root = makeRoot()
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      root.removeBehavior = 'denied'

      const result = await adapter.archiveProject(ref)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.reason).toBe('permission-denied')
    })

    it('cleans up the archive copy if removing the active package fails', async () => {
      const root = makeRoot()
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      root.removeBehavior = 'denied'

      const result = await adapter.archiveProject(ref)

      expect(result.ok).toBe(false)
      const list = await adapter.listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('ready')
      if (list[0].status !== 'ready') throw new Error('expected ready entry')
      expect(list[0].archived).toBeFalsy()
    })

    it('cleans up the restored active copy if removing the archive package fails', async () => {
      const root = makeRoot()
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      const archived = await adapter.archiveProject(ref)
      if (!archived.ok) throw new Error('archive prerequisite failed')
      const archiveRoot = await root.getDirectoryHandle(WRITEROS_ARCHIVE_SUBFOLDER_NAME) as FakeDirectoryHandleWithRemove
      archiveRoot.removeBehavior = 'denied'

      const result = await adapter.restoreProject(archived.ref)

      expect(result.ok).toBe(false)
      const list = await adapter.listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('ready')
      if (list[0].status !== 'ready') throw new Error('expected ready entry')
      expect(list[0].archived).toBe(true)
    })

    it('rejects archive on browsers without removeEntry', async () => {
      const root = new FakeDirectoryHandle('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())

      const result = await adapter.archiveProject(ref)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.reason).toBe('unsupported')
    })
  })

  describe('Vault path reservation (Slice 4)', () => {
    // Regression: per the Vault PRD, the workspace root reserves `_vault/`
    // as a future writer-facing folder. The project storage adapter must
    // never treat `_vault/` as a project package — neither as a ready entry,
    // nor as a corrupt entry, nor as a delete target.

    class FakeDirectoryHandleWithRemove extends FakeDirectoryHandle {
      removeAttempts: Array<{ name: string; recursive: boolean | undefined }> = []

      async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        this.removeAttempts.push({ name, recursive: options?.recursive })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(this as any).children.delete(name)
      }
    }

    it('listProjects ignores _vault/ at the workspace root', async () => {
      const root = new FakeDirectoryHandle('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      await adapter.writeProject(makeStoredProject())
      // Seed a reserved Vault folder alongside the project package.
      await writeTextFile(root, '_vault/craft-notes.md', '# notes')

      const entries = await adapter.listProjects()

      expect(entries).toHaveLength(1)
      expect(entries[0].status).toBe('ready')
      // _vault/ must NOT appear as a corrupt entry either.
      expect(
        entries.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entry => entry.status === 'corrupt' && (entry as any).packageName === '_vault',
        ),
      ).toBeUndefined()
    })

    it('removeProject does not touch _vault/ at the workspace root', async () => {
      const root = new FakeDirectoryHandleWithRemove('WriterOS Projects')
      const adapter = createFileSystemAccessProjectStorageAdapter(root)
      const ref = await adapter.writeProject(makeStoredProject())
      // Seed a reserved Vault folder with a file the writer cares about.
      await writeTextFile(root, '_vault/craft-notes.md', '# notes')

      const result = await adapter.removeProject(ref)

      expect(result).toEqual({ ok: true, folderAlreadyMissing: false })
      // The only removeEntry call should target the project package.
      expect(root.removeAttempts).toEqual([
        { name: ref.packageName, recursive: true },
      ])
      // _vault/ and its file must still be present.
      const vault = await root.getDirectoryHandle('_vault')
      const note = await vault.getFileHandle('craft-notes.md')
      expect(note).toBeTruthy()
      expect(await (await note.getFile()).text()).toBe('# notes')
    })
  })

  it('copies imported FDX source into a file-backed project package', async () => {
    const root = new FakeDirectoryHandle('WriterOS Projects')
    const adapter = createFileSystemAccessProjectStorageAdapter(root)
    const project = makeStoredProject()
    project.state.meta.sourceImport = {
      kind: 'fdx',
      originalFilename: 'The Salt Line.fdx',
      importedAt: '2026-05-24T00:00:00.000Z',
      rawSource: '<FinalDraft><Content /></FinalDraft>',
    }

    const ref = await adapter.writeProject(project)
    const read = await adapter.readProject(ref)

    expect(read.ok).toBe(true)
    if (!read.ok) throw new Error(read.error.message)
    expect(read.manifest.sourceImport).toMatchObject({
      kind: 'fdx',
      copiedSourcePath: 'script/imported-source.fdx',
    })
    expect(read.project.state.meta.sourceImport).toMatchObject({
      rawSource: '<FinalDraft><Content /></FinalDraft>',
    })
  })
})
