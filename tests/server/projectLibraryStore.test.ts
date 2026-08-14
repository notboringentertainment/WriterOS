import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import {
  serializeWriterOSProjectPackage,
  type WriterOSProjectPackage,
} from '../../client/src/lib/projectPackage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { loadProjectLibraryConfig } from '../../server/projectLibrary/config'
import { acquirePackageWriteLock } from '../../server/projectLibrary/packageLock'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeTemporaryDirectory(label = 'writeros-library-') {
  const directory = await mkdtemp(path.join(tmpdir(), label))
  temporaryRoots.push(directory)
  return directory
}

function makeStoredProject(
  title = 'The Salt Line',
  id = '8f4e2c9a-5c7d-4f6b-a1c2-123456789abc',
): StoredProject {
  const state = defaultProjectState()
  state.meta.title = title
  state.script.rawHtml = '<p data-element-type="scene-heading">EXT. BEACH - DAWN</p>'

  return {
    id,
    createdAt: Date.parse('2026-05-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-05-02T11:30:00.000Z'),
    state,
  }
}

async function writeSerializedPackage(root: string, packageName: string, project: StoredProject) {
  const packagePath = path.join(root, packageName)
  await writePackageFiles(packagePath, serializeWriterOSProjectPackage(project))
  return packagePath
}

async function writePackageFiles(packagePath: string, projectPackage: WriterOSProjectPackage) {
  await mkdir(packagePath, { recursive: true })
  await Promise.all(Object.entries(projectPackage.files).map(async ([relativePath, contents]) => {
    const destination = path.join(packagePath, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents, 'utf8')
  }))
}

function packageLockPath(root: string, projectId: string): string {
  const projectHash = createHash('sha256').update(projectId).digest('hex')
  return path.join(root, `.writeros-project-${projectHash}.lock`)
}

describe('project library configuration', () => {
  it('disables server storage when WRITEROS_PROJECTS_ROOT is absent', async () => {
    const config = await loadProjectLibraryConfig({ HOST: '127.0.0.1', PORT: '5177' })

    expect(config).toMatchObject({
      enabled: false,
      rootPath: null,
      label: null,
    })
    expect(config.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('rejects a configured root that is relative or not a directory', async () => {
    const root = await makeTemporaryDirectory()
    const filePath = path.join(root, 'not-a-directory')
    await writeFile(filePath, 'nope', 'utf8')

    await expect(loadProjectLibraryConfig({ WRITEROS_PROJECTS_ROOT: 'relative/projects' }))
      .rejects.toThrow('WRITEROS_PROJECTS_ROOT must be an absolute directory path.')
    await expect(loadProjectLibraryConfig({ WRITEROS_PROJECTS_ROOT: filePath }))
      .rejects.toThrow('WRITEROS_PROJECTS_ROOT must point to a directory.')
  })

  it('canonicalizes root, exposes basename, token, and loopback origins', async () => {
    const parent = await makeTemporaryDirectory()
    const root = path.join(parent, 'WriterOS Projects')
    await mkdir(root)

    const config = await loadProjectLibraryConfig({
      WRITEROS_PROJECTS_ROOT: root,
      PORT: '5177',
    })

    expect(config).toMatchObject({
      enabled: true,
      rootPath: await realpath(root),
      label: 'WriterOS Projects',
    })
    expect(config.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect([...config.allowedOrigins]).toEqual([
      'http://127.0.0.1:5177',
      'http://localhost:5177',
      'http://[::1]:5177',
    ])
  })

  it('rejects server project storage on non-loopback hosts', async () => {
    const root = await makeTemporaryDirectory()

    await expect(loadProjectLibraryConfig({
      WRITEROS_PROJECTS_ROOT: root,
      HOST: '0.0.0.0',
      PORT: '5177',
    })).rejects.toThrow('WRITEROS_PROJECTS_ROOT requires a loopback HOST.')
  })
})

describe('project package write lock', () => {
  it('keeps a successor waiting while release is in progress', async () => {
    const root = await makeTemporaryDirectory()
    const projectId = makeStoredProject().id
    let releaseEntered!: () => void
    const atRelease = new Promise<void>(resolve => {
      releaseEntered = resolve
    })
    let allowRelease!: () => void
    const mayRelease = new Promise<void>(resolve => {
      allowRelease = resolve
    })
    const first = await acquirePackageWriteLock({
      workspaceRoot: root,
      projectId,
      testHooks: {
        beforeRelease: async () => {
          releaseEntered()
          await mayRelease
        },
      },
    })

    const release = first.release()
    await atRelease
    const successorPromise = acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 500 })
    allowRelease()
    await release
    const successor = await successorPromise
    const thirdResult = await acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 60 })
      .then(lock => {
        return { outcome: 'acquired', lock }
      }, error => ({ outcome: String((error as { code?: string }).code), lock: null }))

    await thirdResult.lock?.release()
    await successor.release()
    expect(thirdResult.outcome).toBe('lock-timeout')
  })

  it('elects only one contender after recovering a stale claim', async () => {
    const root = await makeTemporaryDirectory()
    const projectId = makeStoredProject().id
    const lockPath = packageLockPath(root, projectId)
    await writeFile(lockPath, `${JSON.stringify({
      kind: 'claim',
      token: 'stale-owner',
      hostname: hostname(),
      pid: 2_147_483_647,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    })}\n`, 'utf8')
    const contenderPromise = acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 500 })
    const successorPromise = acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 60 })
    const contender = await contenderPromise
    const successorResult = await successorPromise.then(lock => ({
      outcome: 'acquired',
      lock,
    }), error => ({
      outcome: String((error as { code?: string }).code),
      lock: null,
    }))

    await successorResult.lock?.release()
    await contender.release()
    expect(successorResult.outcome).toBe('lock-timeout')
  })

  it('rejects a lock journal replaced by a symlink before append', async () => {
    const root = await makeTemporaryDirectory()
    const outside = await makeTemporaryDirectory('writeros-outside-lock-')
    const projectId = makeStoredProject().id
    const unrelatedPath = path.join(outside, 'unrelated.txt')
    await writeFile(unrelatedPath, 'must remain unchanged\n', 'utf8')
    let swapped = false

    const result = await acquirePackageWriteLock({
      workspaceRoot: root,
      projectId,
      timeoutMs: 100,
      testHooks: {
        beforeJournalOpen: async lockPath => {
          if (swapped) return
          swapped = true
          await rename(lockPath, `${lockPath}.displaced`)
          await symlink(unrelatedPath, lockPath)
        },
      },
    }).then(async lock => {
      await lock.release()
      return 'acquired'
    }, error => String((error as { code?: string }).code))

    expect(result).toBe('lock-corrupt')
    expect(await readFile(unrelatedPath, 'utf8')).toBe('must remain unchanged\n')
  })

  it('recovers an incomplete crash tail before the next complete record', async () => {
    const root = await makeTemporaryDirectory()
    const projectId = makeStoredProject().id
    const first = await acquirePackageWriteLock({ workspaceRoot: root, projectId })
    await first.release()
    await writeFile(packageLockPath(root, projectId), 'WOSLOCK1 incomplete-tail', { flag: 'a' })

    const successor = await acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 100 })
    await successor.release()
  })

  it('rejects a malformed complete framed journal record', async () => {
    const root = await makeTemporaryDirectory()
    const projectId = makeStoredProject().id
    const first = await acquirePackageWriteLock({ workspaceRoot: root, projectId })
    await first.release()
    await writeFile(packageLockPath(root, projectId), '\nWOSLOCK1 not-valid-base64! END\n', { flag: 'a' })

    await expect(acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 100 }))
      .rejects.toMatchObject({ code: 'lock-corrupt' })
  })

  it('retries release after a transient filesystem failure', async () => {
    const root = await makeTemporaryDirectory()
    const projectId = makeStoredProject().id
    let failRelease = true
    const lock = await acquirePackageWriteLock({
      workspaceRoot: root,
      projectId,
      testHooks: {
        beforeRelease: async () => {
          if (!failRelease) return
          failRelease = false
          throw Object.assign(new Error('simulated transient lock release failure'), { code: 'EIO' })
        },
      },
    })

    await expect(lock.release()).rejects.toThrow('simulated transient lock release failure')
    await lock.release()

    const successor = await acquirePackageWriteLock({ workspaceRoot: root, projectId, timeoutMs: 100 })
    await successor.release()
  })
})

describe('server project library store', () => {
  it('lists valid projects, corrupt packages, and ignores unrelated entries', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    await writeSerializedPackage(root, 'The Salt Line (8f4e2c9a).writeros', project)
    await mkdir(path.join(root, 'Broken.writeros'))
    await writeFile(path.join(root, 'Broken.writeros', 'project.json'), '{not json', 'utf8')
    await mkdir(path.join(root, 'Archive'))
    await writeFile(path.join(root, 'notes.txt'), 'ignore me', 'utf8')

    const store = await createProjectLibraryStore(root)
    const entries = await store.listProjects()

    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual(expect.objectContaining({
      status: 'ready',
      ref: expect.objectContaining({
        id: project.id,
        kind: 'server',
        packageName: 'The Salt Line (8f4e2c9a).writeros',
        summary: expect.objectContaining({ title: 'The Salt Line' }),
      }),
    }))
    expect(entries).toContainEqual(expect.objectContaining({
      status: 'corrupt',
      packageName: 'Broken.writeros',
      error: expect.objectContaining({ code: 'invalid-json', path: 'project.json' }),
    }))
  })

  it('reads projects by manifest project id and refreshes after Finder changes', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    const store = await createProjectLibraryStore(root)
    await writeSerializedPackage(root, 'Hand Added.writeros', project)

    const result = await store.readProject(project.id)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.meta.title).toBe('The Salt Line')
    await expect(store.readProject('missing-project')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects symlinked packages without following their targets', async () => {
    const root = await makeTemporaryDirectory()
    const outside = await makeTemporaryDirectory('writeros-outside-')
    const project = makeStoredProject()
    const outsidePackage = await writeSerializedPackage(outside, 'Outside.writeros', project)
    await symlink(outsidePackage, path.join(root, 'Linked.writeros'))

    const store = await createProjectLibraryStore(root)
    const entries = await store.listProjects()

    expect(entries).toEqual([
      expect.objectContaining({
        status: 'corrupt',
        packageName: 'Linked.writeros',
        error: expect.objectContaining({ code: 'unsafe-path' }),
      }),
    ])
    await expect(store.readProject(project.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('creates, reads, and renames complete project packages by project id', async () => {
    const root = await makeTemporaryDirectory()
    const store = await createProjectLibraryStore(root)
    const project = makeStoredProject()

    const firstRef = await store.writeProject(project)
    const renamedProject = makeStoredProject('Salt Line Revised')
    renamedProject.updatedAt += 1_000
    const renamedRef = await store.writeProject(renamedProject)

    expect(firstRef.packageName).toBe('The Salt Line (8f4e2c9a).writeros')
    expect(renamedRef.packageName).toBe('Salt Line Revised (8f4e2c9a).writeros')
    expect((await readdir(root)).filter(name => name.endsWith('.writeros'))).toEqual([
      'Salt Line Revised (8f4e2c9a).writeros',
    ])
    const manifest = JSON.parse(await readFile(path.join(root, renamedRef.packageName, 'project.json'), 'utf8'))
    expect(manifest).toMatchObject({ projectId: project.id, title: 'Salt Line Revised' })
    const read = await store.readProject(project.id)
    expect(read.ok && read.project.updatedAt).toBe(renamedProject.updatedAt)
  })

  it('preserves shared workflow folders, binary files, and source mappings on save', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    const packagePath = await writeSerializedPackage(root, packageName, project)
    const manifestPath = path.join(packagePath, 'project.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.sources = { buzzChannelId: '4f4cb9b3-39a5-4ffc-9d09-b9397e3bbc10' }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const preservedFiles: Array<[string, string | Buffer]> = [
      ['memory/events.jsonl', '{"revision":1}\n'],
      ['wayfinder/canon.json', '{"status":"approved"}\n'],
      ['notes/research.md', '# Tide tables\n'],
      ['assets/reference.txt', 'beach reference\n'],
      ['workflow-cache/model.bin', Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x01])],
    ]
    for (const [relativePath, contents] of preservedFiles) {
      const destination = path.join(packagePath, relativePath)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, contents)
    }

    const store = await createProjectLibraryStore(root)
    const changed = makeStoredProject()
    changed.updatedAt += 5_000
    changed.state.script.rawHtml = '<p>Changed by WriterOS</p>'

    await store.writeProject(changed)

    for (const [relativePath, contents] of preservedFiles) {
      const actual = await readFile(path.join(packagePath, relativePath))
      expect(actual).toEqual(Buffer.isBuffer(contents) ? contents : Buffer.from(contents))
    }
    const savedManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(savedManifest).toMatchObject({
      schemaVersion: 1,
      sources: { buzzChannelId: '4f4cb9b3-39a5-4ffc-9d09-b9397e3bbc10' },
    })
  })

  it('serializes WriterOS saves with memory publication through the package lock', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    await writeSerializedPackage(root, 'The Salt Line (8f4e2c9a).writeros', project)
    const store = await createProjectLibraryStore(root)
    const publicationLock = await acquirePackageWriteLock({ workspaceRoot: root, projectId: project.id })
    const packagePath = await store.resolveProjectPackagePath(project.id)
    const changed = makeStoredProject()
    changed.updatedAt += 5_000
    changed.state.script.rawHtml = '<p>Concurrent WriterOS save</p>'
    let saveSettled = false
    const savePromise = store.writeProject(changed).finally(() => {
      saveSettled = true
    })

    await new Promise(resolve => setTimeout(resolve, 75))
    const settledBeforePublication = saveSettled
    const publishedPath = path.join(packagePath, 'memory', 'events.jsonl')
    await mkdir(path.dirname(publishedPath), { recursive: true })
    await writeFile(publishedPath, '{"revision":1,"kind":"published"}\n', 'utf8')
    await publicationLock.release()
    await savePromise

    expect(settledBeforePublication).toBe(false)
    expect(await readFile(publishedPath, 'utf8')).toBe('{"revision":1,"kind":"published"}\n')
    const read = await store.readProject(project.id)
    expect(read.ok && read.project.updatedAt).toBe(changed.updatedAt)
  })

  it('resolves the renamed live package only after a writer-first save releases the lock', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    const originalName = 'The Salt Line (8f4e2c9a).writeros'
    await writeSerializedPackage(root, originalName, project)
    let writerReachedSwap!: () => void
    const writerAtSwap = new Promise<void>(resolve => {
      writerReachedSwap = resolve
    })
    let allowWriterSwap!: () => void
    const writerMaySwap = new Promise<void>(resolve => {
      allowWriterSwap = resolve
    })
    const realRename = rename
    const store = await createProjectLibraryStore(root, {
      fileOperations: {
        rename: async (from, to) => {
          if (path.basename(from).startsWith('.writeros-stage-') && path.basename(to).startsWith('Salt Line Revised')) {
            writerReachedSwap()
            await writerMaySwap
          }
          await realRename(from, to)
        },
      },
    })
    const changed = makeStoredProject('Salt Line Revised')
    changed.updatedAt += 5_000
    const writerSave = store.writeProject(changed)
    await writerAtSwap

    const publication = (async () => {
      const publicationLock = await acquirePackageWriteLock({ workspaceRoot: root, projectId: project.id })
      try {
        const livePackagePath = await store.resolveProjectPackagePath(project.id)
        const publishedPath = path.join(livePackagePath, 'memory', 'events.jsonl')
        await mkdir(path.dirname(publishedPath), { recursive: true })
        await writeFile(publishedPath, '{"revision":2,"kind":"writer-first"}\n', 'utf8')
        return { livePackagePath, publishedPath }
      } finally {
        await publicationLock.release()
      }
    })()

    allowWriterSwap()
    const [savedRef, published] = await Promise.all([writerSave, publication])

    expect(path.basename(published.livePackagePath)).toBe(savedRef.packageName)
    expect(await readFile(published.publishedPath, 'utf8')).toBe('{"revision":2,"kind":"writer-first"}\n')
    await expect(readFile(path.join(root, originalName, 'project.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a symlink anywhere inside the package tree before preserving it', async () => {
    const root = await makeTemporaryDirectory()
    const outside = await makeTemporaryDirectory('writeros-outside-')
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    const packagePath = await writeSerializedPackage(root, packageName, project)
    const manifestPath = path.join(packagePath, 'project.json')
    const manifestBefore = await readFile(manifestPath, 'utf8')
    const outsideFile = path.join(outside, 'private.jsonl')
    await writeFile(outsideFile, 'outside must remain untouched\n', 'utf8')
    const linkPath = path.join(packagePath, 'memory', 'nested', 'events.jsonl')
    await mkdir(path.dirname(linkPath), { recursive: true })
    await symlink(outsideFile, linkPath)
    const store = await createProjectLibraryStore(root)
    const changed = makeStoredProject()
    changed.updatedAt += 5_000

    await expect(store.writeProject(changed)).rejects.toMatchObject({
      statusCode: 400,
      code: 'unsafe-path',
    })

    expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore)
    expect(await readFile(outsideFile, 'utf8')).toBe('outside must remain untouched\n')
  })

  it('rejects a package file replaced by a symlink after validation but before copy', async () => {
    const root = await makeTemporaryDirectory()
    const outside = await makeTemporaryDirectory('writeros-outside-')
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    const packagePath = await writeSerializedPackage(root, packageName, project)
    const sourcePath = path.join(packagePath, 'memory', 'events.jsonl')
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, '{"revision":1}\n', 'utf8')
    const outsideFile = path.join(outside, 'private.jsonl')
    await writeFile(outsideFile, 'outside must never be copied\n', 'utf8')
    const store = await createProjectLibraryStore(root, {
      fileOperations: {
        beforePreservedFileOpen: async candidatePath => {
          if (!candidatePath.endsWith(path.join('memory', 'events.jsonl'))) return
          await rm(candidatePath)
          await symlink(outsideFile, candidatePath)
        },
      },
    })
    const changed = makeStoredProject()
    changed.updatedAt += 5_000

    await expect(store.writeProject(changed)).rejects.toMatchObject({
      statusCode: 400,
      code: 'unsafe-path',
    })

    expect(await readFile(outsideFile, 'utf8')).toBe('outside must never be copied\n')
  })

  it('copies from a lock-owned snapshot when a live ancestor is swapped during save', async () => {
    const root = await makeTemporaryDirectory()
    const outside = await makeTemporaryDirectory('writeros-outside-ancestor-')
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    const packagePath = await writeSerializedPackage(root, packageName, project)
    const memoryPath = path.join(packagePath, 'memory')
    const sourcePath = path.join(memoryPath, 'events.jsonl')
    await mkdir(memoryPath)
    await writeFile(sourcePath, 'safe package bytes\n', 'utf8')
    await writeFile(path.join(outside, 'events.jsonl'), 'outside bytes must not be copied\n', 'utf8')
    let ancestorSwapAttempted = false
    const store = await createProjectLibraryStore(root, {
      fileOperations: {
        afterPackageSnapshot: async originalPath => {
          ancestorSwapAttempted = true
          await mkdir(originalPath)
          await symlink(outside, path.join(originalPath, 'memory'))
          await rm(originalPath, { recursive: true, force: true })
        },
      },
    })
    const changed = makeStoredProject()
    changed.updatedAt += 5_000

    await store.writeProject(changed)

    expect(ancestorSwapAttempted).toBe(true)
    expect(await readFile(path.join(packagePath, 'memory', 'events.jsonl'), 'utf8'))
      .toBe('safe package bytes\n')
    expect(await readFile(path.join(outside, 'events.jsonl'), 'utf8'))
      .toBe('outside bytes must not be copied\n')
  })

  it('leaves existing package unchanged when staged commit fails', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    await writeSerializedPackage(root, packageName, project)
    const before = await readFile(path.join(root, packageName, 'project.json'), 'utf8')
    const realRename = rename
    const store = await createProjectLibraryStore(root, {
      fileOperations: {
        rename: async (from, to) => {
          if (path.basename(from).startsWith('.writeros-stage-') && path.basename(to) === packageName) {
            throw Object.assign(new Error('simulated swap failure'), { code: 'EIO' })
          }
          await realRename(from, to)
        },
      },
    })
    const changed = makeStoredProject()
    changed.updatedAt += 5_000

    await expect(store.writeProject(changed)).rejects.toThrow('simulated swap failure')

    expect(await readFile(path.join(root, packageName, 'project.json'), 'utf8')).toBe(before)
    expect((await readdir(root)).filter(name => (
      name.startsWith('.writeros-stage-') || name.startsWith('.writeros-backup-')
    ))).toEqual([])
  })

  it('preserves the transaction error when lock release also fails', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    const packageName = 'The Salt Line (8f4e2c9a).writeros'
    await writeSerializedPackage(root, packageName, project)
    const realRename = rename
    let failLockRelease = false
    const store = await createProjectLibraryStore(root, {
      packageLockTestHooks: {
        beforeRelease: async () => {
          if (!failLockRelease) return
          failLockRelease = false
          throw Object.assign(new Error('simulated transient lock release failure'), { code: 'EIO' })
        },
      },
      fileOperations: {
        rename: async (from, to) => {
          if (path.basename(from).startsWith('.writeros-stage-') && path.basename(to) === packageName) {
            failLockRelease = true
            throw Object.assign(new Error('simulated swap failure'), { code: 'EIO' })
          }
          await realRename(from, to)
        },
      },
    })
    const changed = makeStoredProject()
    changed.updatedAt += 5_000

    await expect(store.writeProject(changed)).rejects.toThrow('simulated swap failure')
  })

  it('rejects project ids containing path separators before writing', async () => {
    const root = await makeTemporaryDirectory()
    const store = await createProjectLibraryStore(root)
    const project = makeStoredProject('Unsafe', '../../../../tmp/victim')

    await expect(store.writeProject(project)).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid-project',
    })
    expect(await readdir(root)).toEqual([])
  })

  it('keeps the committed package when backup cleanup fails after a title change', async () => {
    const root = await makeTemporaryDirectory()
    const project = makeStoredProject()
    await writeSerializedPackage(root, 'The Salt Line (8f4e2c9a).writeros', project)
    const realRm = rm
    const store = await createProjectLibraryStore(root, {
      fileOperations: {
        rm: async (target, options) => {
          if (path.basename(target).startsWith('.writeros-backup-')) {
            throw Object.assign(new Error('simulated backup cleanup failure'), { code: 'EIO' })
          }
          await realRm(target, options)
        },
      },
    })
    const changed = makeStoredProject('Salt Line Revised')
    changed.updatedAt += 5_000

    const ref = await store.writeProject(changed)

    expect(ref.packageName).toBe('Salt Line Revised (8f4e2c9a).writeros')
    expect((await readdir(root)).filter(name => name.endsWith('.writeros'))).toEqual([
      'Salt Line Revised (8f4e2c9a).writeros',
    ])
    const read = await store.readProject(project.id)
    expect(read.ok && read.project.state.meta.title).toBe('Salt Line Revised')
  })
})
