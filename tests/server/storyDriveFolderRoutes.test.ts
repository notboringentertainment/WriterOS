import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { readStoryDriveLinks, writeStoryDriveLink } from '../../server/projectLibrary/storyDriveLinks'
import {
  defaultStoryDriveSearchRoot,
  registerStoryDriveFolderRoutes,
  type StoryDriveFolderDeps,
} from '../../server/projectLibrary/storyDriveFolderRoutes'
import { runProjectMemoryCli } from '../../server/projectMemory/cli'
import { writerOSObserverIdle } from '../../server/projectMemory/writerOSObserver'

const FIXTURE = path.resolve(__dirname, '../fixtures/beatSheet/synthetic-beat-sheet.md')
const PROJECT_ID = 'link-route-project-1234'
const OTHER_ID = 'link-route-other-5678'

const servers: Server[] = []
const roots: string[] = []
let workspace: string
let scripts: string
let store: ProjectLibraryStore
let port: number
let imports: Array<{ packagePath: string; root: string }>
let importImpl: StoryDriveFolderDeps['importCanon']
let morganOpen: boolean

const headers = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'test-session-token' }
const linkPath = (projectId = PROJECT_ID) => `/api/project-library/projects/${projectId}/story-drive-link`

function config(): ProjectLibraryConfig {
  return {
    enabled: true,
    rootPath: workspace,
    label: 'WriterOS Projects',
    sessionToken: 'test-session-token',
    allowedOrigins: new Set(['http://127.0.0.1:5177']),
  }
}

function makeProject(id: string, title: string): StoredProject {
  const state = defaultProjectState()
  state.meta.title = title
  return { id, createdAt: Date.parse('2026-08-01T12:00:00.000Z'), updatedAt: Date.parse('2026-08-02T12:00:00.000Z'), state }
}

function requestJson(requestPath: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method ?? 'GET',
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
        ...(options.headers ?? headers),
      },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: response.statusCode ?? 0, json: text ? JSON.parse(text) : undefined })
      })
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

/** A Story-drive project folder with a wayfinder folder holding the given sub-folders. */
async function storyDriveFolder(name: string, dirs: string[] = ['tickets', 'resolved']) {
  const wayfinder = path.join(scripts, name, 'wayfinder')
  await mkdir(wayfinder, { recursive: true })
  for (const dir of dirs) await mkdir(path.join(wayfinder, dir), { recursive: true })
  return wayfinder
}

async function withBeatSheet(name: string) {
  const wayfinder = await storyDriveFolder(name)
  await writeFile(path.join(wayfinder, 'resolved', 'synthetic-beat-sheet.md'), await readFile(FIXTURE, 'utf8'), 'utf8')
  return wayfinder
}

async function start(searchRoot = scripts) {
  const app = express()
  app.use(express.json())
  registerStoryDriveFolderRoutes(app, config(), store, {
    searchRoot,
    importCanon: (packagePath, root) => importImpl(packagePath, root),
    isMorganOpen: () => morganOpen,
  })
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'writeros-link-ws-'))
  scripts = await mkdtemp(path.join(tmpdir(), 'writeros-link-scripts-'))
  roots.push(workspace, scripts)
  store = await createProjectLibraryStore(workspace)
  await store.writeProject(makeProject(PROJECT_ID, 'The Salt Line'))
  await store.writeProject(makeProject(OTHER_ID, 'Harbour Lights'))
  imports = []
  importImpl = async (packagePath, root) => { imports.push({ packagePath, root }) }
  morganOpen = false
  await start()
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await writerOSObserverIdle()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Story-drive folder discovery', () => {
  it('offers folders with a real wayfinder holding tickets or resolved, and skips the rest', async () => {
    await storyDriveFolder('The Salt Line')
    await storyDriveFolder('Resolved Only', ['resolved'])
    await storyDriveFolder('Map Only', [])
    await writeFile(path.join(scripts, 'Map Only', 'wayfinder', 'MAP.md'), '# map\n')
    await storyDriveFolder('.hidden')
    await storyDriveFolder('_to_delete')
    await mkdir(path.join(scripts, 'No Wayfinder'))
    const outside = await mkdtemp(path.join(tmpdir(), 'writeros-link-outside-'))
    roots.push(outside)
    await mkdir(path.join(outside, 'wayfinder', 'tickets'), { recursive: true })
    await symlink(outside, path.join(scripts, 'Linked Parent'))
    await mkdir(path.join(scripts, 'Linked Wayfinder'))
    await symlink(path.join(outside, 'wayfinder'), path.join(scripts, 'Linked Wayfinder', 'wayfinder'))
    const badTickets = await storyDriveFolder('Bad Tickets', ['resolved'])
    await symlink(path.join(outside, 'wayfinder', 'tickets'), path.join(badTickets, 'tickets'))

    const response = await requestJson('/api/project-library/story-drive/folders')
    expect(response.status).toBe(200)
    expect(response.json.searchRoot).toBe(scripts)
    expect(response.json.folders.map((folder: { name: string }) => folder.name)).toEqual(['Resolved Only', 'The Salt Line'])
  })

  it('offers nothing when the search root sits under a symbolic link', async () => {
    await storyDriveFolder('The Salt Line')
    const alias = path.join(await mkdtemp(path.join(tmpdir(), 'writeros-link-alias-')), 'scripts')
    roots.push(path.dirname(alias))
    await symlink(scripts, alias)
    await start(alias)
    const response = await requestJson('/api/project-library/story-drive/folders')
    expect(response.status).toBe(200)
    expect(response.json.folders).toEqual([])
  })

  it('marks a folder owned by another project, whichever root form the registry used', async () => {
    await storyDriveFolder('Harbour Lights')
    await storyDriveFolder('Fog Bank')
    await storyDriveFolder('The Salt Line')
    // CLI links may name the project folder or its wayfinder folder.
    await writeStoryDriveLink(workspace, OTHER_ID, { root: path.join(scripts, 'Harbour Lights') })
    await writeStoryDriveLink(workspace, 'gone-project-0001', { root: path.join(scripts, 'Fog Bank', 'wayfinder') })
    const response = await requestJson('/api/project-library/story-drive/folders')
    const byName = Object.fromEntries(response.json.folders.map((folder: any) => [folder.name, folder.linkedTo]))
    expect(byName['Harbour Lights']).toEqual({ projectId: OTHER_ID, title: 'Harbour Lights' })
    expect(byName['Fog Bank']).toEqual({ projectId: 'gone-project-0001', title: 'another project' })
    expect(byName['The Salt Line']).toBeNull()
  })

  it('refuses requests without the session header or from another origin', async () => {
    expect((await requestJson('/api/project-library/story-drive/folders', { headers: { Origin: 'http://127.0.0.1:5177' } })).status).toBe(401)
    expect((await requestJson('/api/project-library/story-drive/folders', { headers: { ...headers, Origin: 'http://evil.test' } })).status).toBe(403)
  })

  it('defaults the search root to My Scripts unless WRITEROS_STORY_DRIVE_ROOT names an absolute folder', () => {
    expect(defaultStoryDriveSearchRoot({}, '/Users/x')).toBe('/Users/x/Library/Mobile Documents/com~apple~CloudDocs/My Scripts')
    expect(defaultStoryDriveSearchRoot({ WRITEROS_STORY_DRIVE_ROOT: '/srv/scripts' }, '/Users/x')).toBe('/srv/scripts')
    expect(defaultStoryDriveSearchRoot({ WRITEROS_STORY_DRIVE_ROOT: 'relative' }, '/Users/x')).toContain('My Scripts')
  })
})

describe('linking a project', () => {
  it('links, syncs the beats, imports canon once, and returns the beats', async () => {
    const wayfinder = await withBeatSheet('The Salt Line')
    const response = await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(response.status).toBe(200)
    expect(response.json.link).toEqual({ folderName: 'The Salt Line' })
    expect(response.json.beatSheet.kind).toBe('updated')
    expect(response.json.outline.content.units.length).toBeGreaterThan(0)
    expect(response.json.canon).toEqual({ status: 'imported' })
    expect(response.json.morganOpen).toBe(false)
    const canonical = await realpath(wayfinder)
    expect((await readStoryDriveLinks(workspace)).links[PROJECT_ID]).toEqual({ root: canonical })
    expect(imports).toEqual([{ packagePath: await store.resolveProjectPackagePath(PROJECT_ID), root: canonical }])
  })

  it('still returns the beats when the real canon import runs its own sync', async () => {
    await withBeatSheet('The Salt Line')
    importImpl = async (packagePath, root) => {
      const code = await runProjectMemoryCli(
        ['import', '--source', 'wayfinder', '--project', packagePath, '--from', root, '--apply'],
        { stdout: () => undefined, stderr: () => undefined },
      )
      if (code !== 0) throw new Error(`import exited ${code}`)
    }
    const response = await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(response.status).toBe(200)
    expect(response.json.canon).toEqual({ status: 'imported' })
    expect(response.json.beatSheet.kind).toBe('updated')
    expect(response.json.outline.content.units.length).toBeGreaterThan(0)
  })

  it('keeps the link when the canon import fails, and the retry route reruns only the import', async () => {
    await withBeatSheet('The Salt Line')
    importImpl = async () => { throw new Error('boom') }
    const response = await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(response.status).toBe(200)
    expect(response.json.canon.status).toBe('failed')
    expect(response.json.canon.message).not.toContain('boom')
    expect((await readStoryDriveLinks(workspace)).links[PROJECT_ID]).toBeDefined()

    importImpl = async (packagePath, root) => { imports.push({ packagePath, root }) }
    const retry = await requestJson(`${linkPath()}/import-canon`, { method: 'POST' })
    expect(retry.status).toBe(200)
    expect(retry.json.canon).toEqual({ status: 'imported' })
    expect(imports).toHaveLength(1)
  })

  it('refuses the retry route for a project that is not linked', async () => {
    const response = await requestJson(`${linkPath()}/import-canon`, { method: 'POST' })
    expect(response.status).toBe(409)
  })

  it('reports an open Morgan session', async () => {
    await storyDriveFolder('The Salt Line')
    morganOpen = true
    const response = await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(response.json.morganOpen).toBe(true)
  })

  it('refuses folder names that are not offered, including path-like names', async () => {
    await storyDriveFolder('The Salt Line')
    for (const folder of ['Nope', '../The Salt Line', scripts, path.join(scripts, 'The Salt Line'), '.']) {
      const response = await requestJson(linkPath(), { method: 'POST', body: { folder } })
      expect(response.status).toBe(400)
    }
    expect((await readStoryDriveLinks(workspace)).links).toEqual({})
  })

  it('refuses an unknown project without reserving the folder', async () => {
    await storyDriveFolder('The Salt Line')
    const response = await requestJson(linkPath('no-such-project-0000'), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(response.status).toBe(404)
    expect((await readStoryDriveLinks(workspace)).links).toEqual({})
  })

  it('refuses a project that is already linked, and a folder another project owns', async () => {
    await storyDriveFolder('The Salt Line')
    await storyDriveFolder('Harbour Lights')
    await writeStoryDriveLink(workspace, OTHER_ID, { root: path.join(scripts, 'Harbour Lights') })
    const taken = await requestJson(linkPath(), { method: 'POST', body: { folder: 'Harbour Lights' } })
    expect(taken.status).toBe(409)
    expect(taken.json.error).toBe('folder-taken')

    expect((await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })).status).toBe(200)
    const again = await requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } })
    expect(again.status).toBe(409)
    expect(again.json.error).toBe('already-linked')
  })

  it('lets only one of two simultaneous links claim a folder', async () => {
    await storyDriveFolder('The Salt Line')
    const [first, second] = await Promise.all([
      requestJson(linkPath(), { method: 'POST', body: { folder: 'The Salt Line' } }),
      requestJson(linkPath(OTHER_ID), { method: 'POST', body: { folder: 'The Salt Line' } }),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    expect(Object.keys((await readStoryDriveLinks(workspace)).links)).toHaveLength(1)
  })
})
