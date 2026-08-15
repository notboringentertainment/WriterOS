import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelProvider } from '../../server/ai/modelProvider'
import { createProjectMemoryStore, type ProjectMemoryStore } from '../../server/projectMemory/store'
import {
  detectDocumentChanges,
  observeWriterOSSave,
  readAnalysisQueue,
} from '../../server/projectMemory/writerOSObserver'

const capturedAt = '2026-08-13T20:00:00.000Z'
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeProjectPackage(projectId = 'project-observer-1') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-observer-'))
  temporaryRoots.push(workspaceRoot)
  const projectPath = path.join(workspaceRoot, 'Observer Test.writeros')
  await mkdir(projectPath)
  await writeFile(path.join(projectPath, 'project.json'), `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    title: 'Observer Test',
    format: 'feature',
    createdAt: capturedAt,
    updatedAt: capturedAt,
    openedAt: capturedAt,
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2)}\n`, 'utf8')
  return { workspaceRoot, projectPath, projectId }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function analysisJson(records: unknown[]): string {
  return JSON.stringify({ records })
}

function providerFromCalls(handler: (callIndex: number) => Promise<string>): ModelProvider {
  let callIndex = 0
  return {
    name: 'openai',
    model: 'test-model',
    isConfigured: () => true,
    generateResponse: vi.fn(async () => {
      const index = callIndex
      callIndex += 1
      return handler(index)
    }),
  }
}

async function waitForQueueSettled(projectPath: string, timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const items = await readAnalysisQueue(projectPath)
    if (items.length > 0 && items.every(item => item.status === 'done' || item.status === 'failed')) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for analysis queue to settle.')
}

const scriptHtml = (roomLine: string) => [
  '<p data-element-type="scene-heading">INT. ROOM - DAY</p>',
  `<p data-element-type="action">${roomLine}</p>`,
  '<p data-element-type="scene-heading">EXT. STREET - NIGHT</p>',
  '<p data-element-type="action">Rain falls.</p>',
].join('')

describe('detectDocumentChanges', () => {
  it('detects a changed structured surface by normalized content hash, ignoring formatting-only diffs', () => {
    const prior = { 'documents/synopsis.json': '{"title":"A"}' }
    const reformattedSame = { 'documents/synopsis.json': '{ "title":   "A" }' }
    expect(detectDocumentChanges(prior, reformattedSame)).toEqual([])

    const changed = { 'documents/synopsis.json': '{"title":"B"}' }
    const changes = detectDocumentChanges(prior, changed)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      surface: 'synopsis',
      sourceId: 'documents/synopsis.json',
      sourceUri: 'documents/synopsis.json',
      priorText: prior['documents/synopsis.json'],
      currentText: changed['documents/synopsis.json'],
    })
  })

  it('never inspects transcript files', () => {
    const prior = { 'transcripts/writing-partner.json': '{"transcript":[]}' }
    const current = { 'transcripts/writing-partner.json': '{"transcript":[{"id":"1"}]}' }
    expect(detectDocumentChanges(prior, current)).toEqual([])
  })

  it('detects a changed script scene by scene/block hash and leaves unchanged scenes alone', () => {
    const prior = { 'script/script.writeros.html': scriptHtml('Nothing happens.') }
    const current = { 'script/script.writeros.html': scriptHtml('Everything happens.') }
    const changes = detectDocumentChanges(prior, current)
    expect(changes).toHaveLength(1)
    expect(changes[0].surface).toBe('script')
    expect(changes[0].sourceId).toMatch(/^script:scene:/)
    expect(changes[0].currentText).toContain('Everything happens.')
  })

  it('treats a brand-new anchor (no prior file) as changed', () => {
    const changes = detectDocumentChanges({}, { 'documents/outline.json': '{"beats":[]}' })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ surface: 'outline', priorText: null })
  })
})

describe('observeWriterOSSave', () => {
  it('persists the pending item before analysis completes, then publishes a document_fact as active nonbinding memory', async () => {
    const { projectPath, projectId } = await makeProjectPackage()
    const memoryStore = createProjectMemoryStore()
    const gate = deferred<string>()
    const provider = providerFromCalls(async () => gate.promise)

    const savePromise = observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/synopsis.json': '{"title":"A"}' },
      currentFiles: { 'documents/synopsis.json': '{"title":"The lighthouse burned down."}' },
    }, { memoryStore, provider })

    const { queuedCount } = await savePromise
    expect(queuedCount).toBe(1)

    const pendingItems = await readAnalysisQueue(projectPath)
    expect(pendingItems).toHaveLength(1)
    expect(['pending', 'processing']).toContain(pendingItems[0].status)

    gate.resolve(analysisJson([{
      kind: 'document_fact',
      claim: 'The lighthouse burned down.',
      tags: ['setting'],
      entities: ['Lighthouse'],
      evidenceExcerpt: 'The lighthouse burned down.',
      conflictsWith: [],
      safety: 'clear',
    }]))
    await waitForQueueSettled(projectPath)

    const settled = await readAnalysisQueue(projectPath)
    expect(settled[0]).toMatchObject({ status: 'done', publishedCount: 1 })

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const fact = snapshot.records.find(record => record.kind === 'document_fact')
    expect(fact).toMatchObject({ status: 'active', claim: 'The lighthouse burned down.' })
    expect(fact?.source.workflow).toBe('writeros')
  })

  it('publishes decision, development, and open_question analyzer records as candidates, never auto-promoted', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-2')
    const memoryStore = createProjectMemoryStore()
    const provider = providerFromCalls(async () => analysisJson([
      { kind: 'decision', claim: 'The detective decides to leave the force.', tags: [], entities: [], evidenceExcerpt: 'leaves the force', conflictsWith: [], safety: 'clear' },
      { kind: 'development', claim: 'Exploring a rival subplot.', tags: [], entities: [], evidenceExcerpt: 'rival subplot', conflictsWith: [], safety: 'clear' },
      { kind: 'open_question', claim: 'Does the rival survive?', tags: [], entities: [], evidenceExcerpt: 'Does the rival survive?', conflictsWith: [], safety: 'clear' },
    ]))

    await observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/outline.json': '{"beats":[]}' },
      currentFiles: { 'documents/outline.json': '{"beats":["twist"]}' },
    }, { memoryStore, provider })
    await waitForQueueSettled(projectPath)

    const snapshot = await memoryStore.readSnapshot(projectPath)
    for (const kind of ['decision', 'development', 'open_question'] as const) {
      const record = snapshot.records.find(candidate => candidate.kind === kind)
      expect(record, `expected a ${kind} record`).toBeDefined()
      expect(record?.status).toBe('candidate')
    }
  })

  it('links a document_fact against active canon it contradicts, and drops hallucinated conflict ids', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-3')
    const memoryStore = createProjectMemoryStore()

    const canonPublish = await memoryStore.publish(projectPath, {
      projectId,
      dedupeKey: 'seed-canon-1',
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'The bridge was destroyed in the war.',
      tags: [],
      entities: [],
      source: {
        workflow: 'story-wayfinder',
        sourceId: 'seed-1',
        sourceUri: 'story-wayfinder:seed-1',
        sourceHash: 'sha256:seed-1',
        capturedAt,
        approval: 'explicit',
        authority: { ticketType: 'grill', mode: 'hitl' },
      },
      evidence: [],
      safety: 'clear',
      spoiler: false,
    })
    const canonId = canonPublish.record.id

    const provider = providerFromCalls(async () => analysisJson([{
      kind: 'document_fact',
      claim: 'The bridge still stands, fully repaired.',
      tags: [],
      entities: [],
      evidenceExcerpt: 'the bridge still stands',
      conflictsWith: [canonId, 'mem_totally_made_up'],
      safety: 'clear',
    }]))

    await observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/synopsis.json': '{"a":1}' },
      currentFiles: { 'documents/synopsis.json': '{"a":2}' },
    }, { memoryStore, provider })
    await waitForQueueSettled(projectPath)

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const fact = snapshot.records.find(record => record.kind === 'document_fact')
    expect(fact).toBeDefined()
    const conflict = snapshot.conflicts.find(candidate => candidate.leftRecordId === canonId && candidate.rightRecordId === fact?.id)
    expect(conflict).toBeDefined()
    expect(snapshot.conflicts).toHaveLength(1)
  })

  it('forces a safety-flagged record to candidate even when its kind is document_fact', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-4')
    const memoryStore = createProjectMemoryStore()
    const provider = providerFromCalls(async () => analysisJson([{
      kind: 'document_fact',
      claim: 'Unsafe content excerpt.',
      tags: [],
      entities: [],
      evidenceExcerpt: 'unsafe content',
      conflictsWith: [],
      safety: 'flagged',
    }]))

    await observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/synopsis.json': '{"a":1}' },
      currentFiles: { 'documents/synopsis.json': '{"a":2}' },
    }, { memoryStore, provider })
    await waitForQueueSettled(projectPath)

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const fact = snapshot.records.find(record => record.kind === 'document_fact')
    expect(fact?.status).toBe('candidate')
  })

  it('makes exactly one bounded retry after a schema failure, then succeeds', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-5')
    const memoryStore = createProjectMemoryStore()
    const provider = providerFromCalls(async index => (
      index === 0
        ? 'not even json'
        : analysisJson([{ kind: 'document_fact', claim: 'Recovered on retry.', tags: [], entities: [], evidenceExcerpt: 'Recovered on retry.', conflictsWith: [], safety: 'clear' }])
    ))

    await observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/synopsis.json': '{"a":1}' },
      currentFiles: { 'documents/synopsis.json': '{"a":2}' },
    }, { memoryStore, provider })
    await waitForQueueSettled(projectPath)

    expect(provider.generateResponse).toHaveBeenCalledTimes(2)
    const settled = await readAnalysisQueue(projectPath)
    expect(settled[0].status).toBe('done')
    const snapshot = await memoryStore.readSnapshot(projectPath)
    expect(snapshot.records.some(record => record.claim === 'Recovered on retry.')).toBe(true)
  })

  it('marks the item failed (visible, queryable) without throwing or publishing anything when the model never recovers', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-6')
    const memoryStore = createProjectMemoryStore()
    const provider = providerFromCalls(async () => 'still not json')

    await expect(observeWriterOSSave({
      projectId,
      projectPath,
      priorFiles: { 'documents/synopsis.json': '{"a":1}' },
      currentFiles: { 'documents/synopsis.json': '{"a":2}' },
    }, { memoryStore, provider })).resolves.toEqual({ queuedCount: 1 })
    await waitForQueueSettled(projectPath)

    expect(provider.generateResponse).toHaveBeenCalledTimes(2)
    const settled = await readAnalysisQueue(projectPath)
    expect(settled[0].status).toBe('failed')
    expect(typeof settled[0].error).toBe('string')
    const snapshot = await memoryStore.readSnapshot(projectPath)
    expect(snapshot.records).toHaveLength(0)
  })

  it('queues nothing and calls the model zero times when nothing changed', async () => {
    const { projectPath, projectId } = await makeProjectPackage('project-observer-7')
    const memoryStore = createProjectMemoryStore()
    const provider = providerFromCalls(async () => analysisJson([]))
    const files = { 'documents/synopsis.json': '{"a":1}' }

    const result = await observeWriterOSSave({ projectId, projectPath, priorFiles: files, currentFiles: files }, { memoryStore, provider })

    expect(result.queuedCount).toBe(0)
    expect(provider.generateResponse).not.toHaveBeenCalled()
    expect(await readAnalysisQueue(projectPath)).toEqual([])
  })
})
