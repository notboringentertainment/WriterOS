import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import {
  serializeWriterOSProjectPackage,
  type WriterOSProjectPackage,
} from '../../client/src/lib/projectPackage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { loadProjectLibraryConfig } from '../../server/projectLibrary/config'
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
    expect(await readdir(root)).toEqual(['Salt Line Revised (8f4e2c9a).writeros'])
    const manifest = JSON.parse(await readFile(path.join(root, renamedRef.packageName, 'project.json'), 'utf8'))
    expect(manifest).toMatchObject({ projectId: project.id, title: 'Salt Line Revised' })
    const read = await store.readProject(project.id)
    expect(read.ok && read.project.updatedAt).toBe(renamedProject.updatedAt)
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
    expect((await readdir(root)).filter(name => name.startsWith('.writeros-'))).toEqual([])
  })
})
