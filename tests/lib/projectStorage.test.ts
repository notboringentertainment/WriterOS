import { describe, expect, it } from 'vitest'
import {
  createFileSystemAccessProjectStorageAdapter,
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
})
