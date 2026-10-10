import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemorySource, PublishMemoryInput } from '../../shared/projectMemory'
// Imported before the outbox so the store -> hook -> outbox cycle resolves to the mock below.
import { projectMemoryStore } from '../../server/projectMemory/store'
import type { DeliverOptions } from '../../server/appeals/appealOutbox'
import { APPEALS_OUTBOX_FILE, readOutbox } from '../../server/appeals/appealOutbox'
import { appealDeliveriesSettled, retryAppealDeliveriesAtStart } from '../../server/appeals/appealHook'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { writeStoryDriveLink } from '../../server/projectLibrary/storyDriveLinks'
import { writeLookLocksExport } from '../../server/looks/lookExport'

// Lets a test swap the ticket writer used by the real delivery the store schedules.
const delivery = vi.hoisted(() => ({ options: {} as Record<string, unknown> }))
vi.mock('../../server/appeals/appealOutbox', async importOriginal => {
  const actual = await importOriginal<typeof import('../../server/appeals/appealOutbox')>()
  return {
    ...actual,
    deliverPendingAppeals: (projectPath: string, root: string | null, options: DeliverOptions = {}) =>
      actual.deliverPendingAppeals(projectPath, root, { ...options, ...delivery.options }),
  }
})

const PROJECT_ID = 'appeal-hook-project-1'
const capturedAt = '2026-10-09T10:00:00.000Z'

let workspace: string
let projectPath: string
let wayfinderRoot: string

beforeEach(async () => {
  delivery.options = {}
  workspace = await mkdtemp(path.join(tmpdir(), 'writeros-appeal-hook-'))
  projectPath = path.join(workspace, 'Vector Station.writeros')
  wayfinderRoot = path.join(workspace, 'story-drive', 'wayfinder')
  await mkdir(projectPath)
  await mkdir(path.join(wayfinderRoot, 'tickets'), { recursive: true })
  await mkdir(path.join(wayfinderRoot, 'resolved'), { recursive: true })
  await writeFile(path.join(projectPath, 'project.json'), `${JSON.stringify({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    title: 'Vector Station',
    format: 'feature',
    createdAt: capturedAt,
    updatedAt: capturedAt,
    openedAt: capturedAt,
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2)}\n`, 'utf8')
  await writeStoryDriveLink(workspace, PROJECT_ID, { root: wayfinderRoot })
})

afterEach(async () => {
  await appealDeliveriesSettled()
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 })
})

function source(overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'writeros',
    sourceId: 'story-lock:vector-station',
    sourceUri: 'documents/story-bible.json#vector-station',
    sourceHash: 'sha256:one',
    capturedAt,
    approval: 'explicit',
    ...overrides,
  }
}

function input(overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  return {
    projectId: PROJECT_ID,
    dedupeKey: 'writeros:story-lock:vector-station',
    kind: 'canon',
    requestedStatus: 'active',
    claim: 'Vector Station orbits the gas giant.',
    entities: ['Vector Station'],
    source: source(),
    ...overrides,
  }
}

const tickets = () => readdir(path.join(wayfinderRoot, 'tickets'))

describe('appeal hook on memory commits', () => {
  it('delivers a ticket after publish() commits a WriterOS canon record', async () => {
    const result = await projectMemoryStore.publish(projectPath, input())
    expect(result.published).toBe(true)
    await vi.waitFor(async () => expect(await tickets()).toHaveLength(1))
    const [file] = await tickets()
    expect(await readFile(path.join(wayfinderRoot, 'tickets', file), 'utf8')).toContain('Vector Station orbits the gas giant.')
    await appealDeliveriesSettled()
    expect((await readOutbox(projectPath)).entries[0].status).toBe('delivered')
  })

  it('delivers a ticket after applyAction() promotes a candidate to canon', async () => {
    const candidate = await projectMemoryStore.publish(projectPath, input({ requestedStatus: 'candidate' }))
    expect(candidate.record.status).toBe('candidate')
    await appealDeliveriesSettled()
    expect(await tickets()).toEqual([])
    await projectMemoryStore.applyAction(projectPath, {
      type: 'promote',
      recordId: candidate.record.id,
      expectedRevision: candidate.snapshot.revision,
      supersedes: [],
    }, PROJECT_ID)
    await vi.waitFor(async () => expect(await tickets()).toHaveLength(1))
  })

  it('raises no appeal for a story-wayfinder import', async () => {
    await projectMemoryStore.publish(projectPath, input({
      dedupeKey: 'wayfinder:resolved:vector-station',
      source: {
        ...source({ workflow: 'story-wayfinder', sourceUri: 'story-wayfinder:resolved/vector-station.md' }),
        authority: { ticketType: 'grill', mode: 'hitl' },
      } as MemorySource,
    }))
    await appealDeliveriesSettled()
    expect(await tickets()).toEqual([])
    expect((await readOutbox(projectPath)).entries).toEqual([])
  })

  it('keeps the afterCommit look export working alongside the appeal', async () => {
    let exportPath: string | null = null
    const result = await projectMemoryStore.publish(projectPath, input(), {
      afterCommit: async committed => { exportPath = await writeLookLocksExport(projectPath, committed) },
    })
    expect(result.afterCommitError).toBeUndefined()
    expect(exportPath).toBe(`memory/exports/look-locks-${result.snapshot.revision}.json`)
    expect(await readdir(path.join(projectPath, 'memory', 'exports'))).toEqual([`look-locks-${result.snapshot.revision}.json`])
    await vi.waitFor(async () => expect(await tickets()).toHaveLength(1))
  })

  it('never waits on a delivery that hangs: publish resolves and the next publish is not blocked', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    let started = false
    delivery.options = { timeoutMs: 60_000, writeFile: () => { started = true; return gate } }

    const first = await projectMemoryStore.publish(projectPath, input())
    expect(first.published).toBe(true)
    await vi.waitFor(() => expect(started).toBe(true))
    const second = await projectMemoryStore.publish(projectPath, input({
      dedupeKey: 'writeros:story-lock:relay-moon',
      claim: 'Relay Moon has no atmosphere.',
      entities: ['Relay Moon'],
      source: source({ sourceId: 'story-lock:relay-moon', sourceHash: 'sha256:two' }),
    }))
    expect(second.published).toBe(true)
    expect(second.snapshot.revision).toBe(first.snapshot.revision + 1)
    release()
    await appealDeliveriesSettled()
  })

  it('still commits when the appeal cannot be queued', async () => {
    const outbox = path.join(projectPath, 'memory', APPEALS_OUTBOX_FILE)
    await mkdir(outbox, { recursive: true })
    await writeFile(path.join(outbox, 'blocker'), 'x')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const before = await projectMemoryStore.readSnapshot(projectPath)
      const result = await projectMemoryStore.publish(projectPath, input())
      expect(result.published).toBe(true)
      expect(result.snapshot.revision).toBe(before.revision + 1)
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('could not be queued'))
      await appealDeliveriesSettled()
      expect(await tickets()).toEqual([])
    } finally {
      errors.mockRestore()
    }
  })

  it('does not queue or deliver again for a duplicate publish', async () => {
    await projectMemoryStore.publish(projectPath, input())
    await appealDeliveriesSettled()
    const outboxBefore = await readFile(path.join(projectPath, 'memory', APPEALS_OUTBOX_FILE), 'utf8')
    const again = await projectMemoryStore.publish(projectPath, input())
    expect(again.published).toBe(false)
    await appealDeliveriesSettled()
    expect(await readFile(path.join(projectPath, 'memory', APPEALS_OUTBOX_FILE), 'utf8')).toBe(outboxBefore)
    expect(await tickets()).toHaveLength(1)
  })
  it('retries undelivered appeals for linked projects at server start', async () => {
    const libraryRoot = path.join(workspace, 'library')
    await mkdir(libraryRoot)
    const library = await createProjectLibraryStore(libraryRoot)
    const state = defaultProjectState()
    state.meta.title = 'Relay Moon'
    await library.writeProject({ id: PROJECT_ID, createdAt: Date.parse(capturedAt), updatedAt: Date.parse(capturedAt), state })
    const packagePath = await library.resolveProjectPackagePath(PROJECT_ID)

    // Not linked yet: the appeal is queued and its delivery fails.
    await projectMemoryStore.publish(packagePath, input())
    await appealDeliveriesSettled()
    expect((await readOutbox(packagePath)).entries[0].status).toBe('failed')

    await writeStoryDriveLink(path.dirname(packagePath), PROJECT_ID, { root: wayfinderRoot })
    await retryAppealDeliveriesAtStart({ WRITEROS_PROJECTS_ROOT: libraryRoot, HOST: '127.0.0.1' })
    await appealDeliveriesSettled()
    expect(await tickets()).toHaveLength(1)
    expect((await readOutbox(packagePath)).entries[0].status).toBe('delivered')
  })
})
