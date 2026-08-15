// WriterOS document-save observer (Task 8). After a successful `.writeros`
// package save, diffs the prior and current package files and turns any
// changed structured surface or script scene into a pending memory-analysis
// item. Pending items are persisted before the save response returns; the
// LLM analysis itself runs afterwards, serially per project, and can never
// fail the document save. There is no server-start resume machinery — a
// failed item just sits, visible via readAnalysisQueue, until Task 9's
// manual retry reprocesses it.

import { randomBytes } from 'node:crypto'
import { open, mkdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  WRITEROS_DOCUMENT_PATHS,
  WRITEROS_SCRIPT_HTML_PATH,
} from '../../client/src/lib/projectPackage'
import { buildScriptIndex, type ScriptIndex, type ScriptSceneIndex } from '../../client/src/lib/scriptIndex'
import { stableHash } from '../../shared/compose/stableHash'
import type { MemoryKind, PublishMemoryInput } from '../../shared/projectMemory'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { createModelProvider, type ModelProvider } from '../ai/modelProvider'
import { analyzeDocumentChange, type MemoryAnalysisRecord } from './analyzer'
import { projectMemoryStore, type ProjectMemoryStore } from './store'

const ANALYSIS_QUEUE_FILE = path.join('memory', 'analysis-queue.json')
const MAX_STORED_TEXT_LENGTH = 20_000

export type AnalysisQueueStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface AnalysisQueueItem {
  id: string
  surface: string
  sourceId: string
  sourceUri: string
  contentHash: string
  priorText: string | null
  currentText: string
  status: AnalysisQueueStatus
  error?: string
  publishedCount?: number
  createdAt: string
  updatedAt: string
}

interface DocumentChangeUnit {
  surface: string
  sourceId: string
  sourceUri: string
  contentHash: string
  priorText: string | null
  currentText: string
}

export interface ObserveWriterOSSaveInput {
  projectId: string
  projectPath: string
  /** Null for a brand-new project — nothing prior to diff against. */
  priorFiles: Record<string, string | undefined> | null
  currentFiles: Record<string, string | undefined>
}

export interface WriterOSObserverDeps {
  memoryStore?: ProjectMemoryStore
  provider?: ModelProvider
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function sceneText(index: ScriptIndex, scene: ScriptSceneIndex): string {
  const blocks = index.blocks.filter(block => block.sceneId === scene.id)
  return [scene.heading, ...blocks.map(block => block.text)].join('\n')
}

function detectScriptSceneChanges(
  priorHtml: string | undefined,
  currentHtml: string,
): DocumentChangeUnit[] {
  const currentIndex = buildScriptIndex(currentHtml)
  const priorIndex = priorHtml === undefined ? null : buildScriptIndex(priorHtml)
  const priorScenesById = new Map((priorIndex?.scenes ?? []).map(scene => [scene.id, scene]))
  const changes: DocumentChangeUnit[] = []
  for (const scene of currentIndex.scenes) {
    const currentText = sceneText(currentIndex, scene)
    const currentHash = stableHash(currentText)
    const priorScene = priorScenesById.get(scene.id)
    const priorText = priorScene && priorIndex ? sceneText(priorIndex, priorScene) : null
    const priorHash = priorText === null ? null : stableHash(priorText)
    if (priorHash === currentHash) continue
    changes.push({
      surface: 'script',
      sourceId: `script:scene:${scene.id}`,
      sourceUri: `${WRITEROS_SCRIPT_HTML_PATH}#scene-${scene.id}`,
      contentHash: currentHash,
      priorText,
      currentText,
    })
  }
  return changes
}

/**
 * Structured surfaces are compared by normalized (parsed + stably
 * serialized) content hash at a stable per-document anchor; script is
 * compared scene-by-scene via scene/block hashes. Transcripts are never
 * inspected — they are excluded entirely from this diff.
 */
export function detectDocumentChanges(
  priorFiles: Record<string, string | undefined>,
  currentFiles: Record<string, string | undefined>,
): DocumentChangeUnit[] {
  const changes: DocumentChangeUnit[] = []

  for (const [surface, relativePath] of Object.entries(WRITEROS_DOCUMENT_PATHS)) {
    const currentRaw = currentFiles[relativePath]
    if (currentRaw === undefined) continue
    const priorRaw = priorFiles[relativePath]
    const currentHash = stableHash(safeParseJson(currentRaw))
    const priorHash = priorRaw === undefined ? null : stableHash(safeParseJson(priorRaw))
    if (priorHash === currentHash) continue
    changes.push({
      surface,
      sourceId: relativePath,
      sourceUri: relativePath,
      contentHash: currentHash,
      priorText: priorRaw ?? null,
      currentText: currentRaw,
    })
  }

  const currentScriptHtml = currentFiles[WRITEROS_SCRIPT_HTML_PATH]
  if (currentScriptHtml !== undefined) {
    changes.push(...detectScriptSceneChanges(priorFiles[WRITEROS_SCRIPT_HTML_PATH], currentScriptHtml))
  }

  return changes
}

// ---- pending-analysis queue persistence -----------------------------------

async function atomicReplace(filePath: string, contents: string): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomBytes(12).toString('hex')}.tmp`,
  )
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function readQueueFile(projectPath: string): Promise<AnalysisQueueItem[]> {
  try {
    const raw = await readFile(path.join(projectPath, ANALYSIS_QUEUE_FILE), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as AnalysisQueueItem[] : []
  } catch {
    return []
  }
}

async function writeQueueFile(projectPath: string, items: AnalysisQueueItem[]): Promise<void> {
  await mkdir(path.join(projectPath, 'memory'), { recursive: true, mode: 0o700 })
  await atomicReplace(path.join(projectPath, ANALYSIS_QUEUE_FILE), `${JSON.stringify(items, null, 2)}\n`)
}

async function withQueueLock<T>(
  projectPath: string,
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lock = await acquirePackageWriteLock({ workspaceRoot: path.dirname(projectPath), projectId })
  try {
    return await operation()
  } finally {
    await lock.release()
  }
}

/** Queryable, durable view of pending/failed analysis items for a project. */
export async function readAnalysisQueue(projectPath: string): Promise<AnalysisQueueItem[]> {
  return readQueueFile(projectPath)
}

// Identity includes the content hash, not just the anchor: a save landing
// while an earlier analysis of the SAME anchor is still in flight describes
// genuinely different content and must get its own queue entry rather than
// overwrite the in-flight one out from under it (see enqueuePendingItems).
function queueItemId(sourceId: string, contentHash: string): string {
  return `analysis_${stableHash(`${sourceId}::${contentHash}`).slice(0, 32)}`
}

async function enqueuePendingItems(
  projectPath: string,
  projectId: string,
  changes: DocumentChangeUnit[],
): Promise<AnalysisQueueItem[]> {
  if (changes.length === 0) return []
  const now = new Date().toISOString()
  return withQueueLock(projectPath, projectId, async () => {
    const existing = await readQueueFile(projectPath)
    const byId = new Map(existing.map(item => [item.id, item]))
    const queued: AnalysisQueueItem[] = []
    for (const change of changes) {
      const id = queueItemId(change.sourceId, change.contentHash)
      const existingItem = byId.get(id)
      // Since the id is content-hash-scoped, a collision here can only be
      // the exact same content re-arriving. If it is already
      // processing/done/failed, leave it alone rather than resetting it
      // back to 'pending' underneath an in-flight or already-terminal run —
      // there is nothing new to analyze either way.
      if (existingItem && existingItem.status !== 'pending') {
        queued.push(existingItem)
        continue
      }
      const item: AnalysisQueueItem = {
        id,
        surface: change.surface,
        sourceId: change.sourceId,
        sourceUri: change.sourceUri,
        contentHash: change.contentHash,
        priorText: change.priorText === null ? null : truncate(change.priorText, MAX_STORED_TEXT_LENGTH),
        currentText: truncate(change.currentText, MAX_STORED_TEXT_LENGTH),
        status: 'pending',
        createdAt: existingItem?.createdAt ?? now,
        updatedAt: now,
      }
      byId.set(id, item)
      queued.push(item)
    }
    await writeQueueFile(projectPath, [...byId.values()])
    return queued
  })
}

async function updateQueueItem(
  projectPath: string,
  projectId: string,
  id: string,
  update: (item: AnalysisQueueItem) => AnalysisQueueItem,
): Promise<void> {
  await withQueueLock(projectPath, projectId, async () => {
    const existing = await readQueueFile(projectPath)
    const index = existing.findIndex(item => item.id === id)
    if (index < 0) return
    const next = [...existing]
    next[index] = update(existing[index])
    await writeQueueFile(projectPath, next)
  })
}

// ---- serial-per-project processing -----------------------------------------

const projectProcessingChains = new Map<string, Promise<void>>()

function chainSerially(projectId: string, task: () => Promise<void>): void {
  const previous = projectProcessingChains.get(projectId) ?? Promise.resolve()
  const next = previous.then(task, task).catch(error => {
    console.error('[writerOSObserver] pending analysis processing failed:', error instanceof Error ? error.message : error)
  })
  projectProcessingChains.set(projectId, next)
}

/**
 * A stable field-path anchor for one analyzer claim, scoped to its document
 * change unit and kind. Deliberately NOT derived from the claim's own
 * wording: the store auto-supersedes an active document_fact only when its
 * (workflow, sourceId, sourceUri) anchor matches exactly, so a reworded
 * restatement of the same fact must land at the SAME anchor to replace it
 * rather than accumulate as a second stale-but-active fact. tags/entities
 * are the model's own stable topic labels for a claim and are far less
 * likely to drift across a re-analysis than the claim sentence itself; the
 * record's position is used only as a last-resort tiebreaker when the model
 * supplied neither (kept distinct per record, never reused as a shared
 * topic key, so two untagged claims cannot collide with each other).
 */
function stableFieldPath(record: MemoryAnalysisRecord, index: number): string {
  const topic = [...record.tags, ...record.entities]
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+')
  return topic || `untagged-${index}`
}

async function publishAnalysisRecord(
  memoryStore: ProjectMemoryStore,
  projectPath: string,
  projectId: string,
  item: AnalysisQueueItem,
  record: MemoryAnalysisRecord,
  index: number,
  knownRecordIds: ReadonlySet<string>,
): Promise<boolean> {
  const kind: MemoryKind = record.kind
  const fieldPath = stableFieldPath(record, index)
  const anchorSourceId = `${item.sourceId}::${kind}::${fieldPath}`
  const capturedAt = new Date().toISOString()
  const conflictsWith = record.conflictsWith.filter(id => knownRecordIds.has(id))
  const input: PublishMemoryInput = {
    projectId,
    // The dedupeKey lives entirely off the stable anchor, never off the
    // model's own output — see stableFieldPath above.
    dedupeKey: `writeros:${item.surface}:${anchorSourceId}`,
    kind,
    // document_fact always lands active regardless of requestedStatus (per
    // store rules) as long as it is safe; everything else — and anything
    // flagged — is requested as a candidate so a WriterOS document edit is
    // never auto-promoted. (Safety-flagged input may not be requested as
    // 'active' at all — PublishMemoryInputSchema rejects that combination.)
    requestedStatus: kind === 'document_fact' && record.safety === 'clear' ? 'active' : 'candidate',
    claim: record.claim,
    ...(record.detail ? { detail: record.detail } : {}),
    tags: record.tags,
    entities: record.entities,
    source: {
      workflow: 'writeros',
      sourceId: anchorSourceId,
      sourceUri: `${item.sourceUri}::${kind}::${fieldPath}`,
      // The hash of the underlying document/scene content that was
      // analyzed, NOT a hash of the model's own (nondeterministic) output.
      // Idempotency (dedupeKey + sourceHash) must be reproducible on a
      // Task-9 retry of unchanged content regardless of wording drift.
      sourceHash: item.contentHash,
      capturedAt,
      approval: 'none',
    },
    evidence: [{ excerpt: truncate(record.evidenceExcerpt, 1_500) }],
    safety: record.safety,
    spoiler: false,
    conflictsWith,
  }
  const result = await memoryStore.publish(projectPath, input)
  return result.published
}

// Belt-and-suspenders on top of the content-hash-scoped id: only ever stamp
// a status transition onto the item if its on-disk contentHash still
// matches the one this run started analyzing. With ids now scoped by
// content hash this should always hold, but a status write must never be
// allowed to land on an entry that turned out to describe different content.
function updateQueueItemIfSameContent(
  projectPath: string,
  projectId: string,
  item: AnalysisQueueItem,
  apply: (current: AnalysisQueueItem) => AnalysisQueueItem,
): Promise<void> {
  return updateQueueItem(projectPath, projectId, item.id, current => (
    current.contentHash === item.contentHash ? apply(current) : current
  ))
}

/**
 * Analyze and publish one queue item. Exported so tests (and Task 9's
 * manual retry) can drive a specific item through the exact production
 * publish path directly, rather than only through the enqueue/short-circuit
 * machinery in observeWriterOSSave.
 */
export async function processQueueItem(
  memoryStore: ProjectMemoryStore,
  provider: ModelProvider,
  projectPath: string,
  projectId: string,
  item: AnalysisQueueItem,
): Promise<void> {
  await updateQueueItemIfSameContent(projectPath, projectId, item, current => ({
    ...current,
    status: 'processing',
    updatedAt: new Date().toISOString(),
  }))

  try {
    const snapshot = await memoryStore.readSnapshot(projectPath)
    const activeCanon = snapshot.records
      .filter(record => record.kind === 'canon' && record.status === 'active')
      .map(record => ({ id: record.id, claim: record.claim }))
    const knownRecordIds = new Set(snapshot.records.map(record => record.id))

    const analysis = await analyzeDocumentChange({
      provider,
      surface: item.surface,
      priorContent: item.priorText,
      currentContent: item.currentText,
      activeCanon,
    })

    let publishedCount = 0
    for (const [index, record] of analysis.records.entries()) {
      const published = await publishAnalysisRecord(memoryStore, projectPath, projectId, item, record, index, knownRecordIds)
      if (published) publishedCount += 1
    }

    await updateQueueItemIfSameContent(projectPath, projectId, item, current => ({
      ...current,
      status: 'done',
      publishedCount,
      updatedAt: new Date().toISOString(),
    }))
  } catch (error) {
    // MemoryAnalysisError (schema failure after the bounded retry) and any
    // other unexpected error are both just surfaced by message — the queue
    // item itself is the durable, queryable "failed" signal either way.
    const message = error instanceof Error ? error.message : 'WriterOS memory analysis failed'
    await updateQueueItemIfSameContent(projectPath, projectId, item, current => ({
      ...current,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    }))
  }
}

async function processPendingQueue(
  memoryStore: ProjectMemoryStore,
  provider: ModelProvider,
  projectPath: string,
  projectId: string,
): Promise<void> {
  const items = await readQueueFile(projectPath)
  for (const item of items) {
    if (item.status !== 'pending') continue
    await processQueueItem(memoryStore, provider, projectPath, projectId, item)
  }
}

/**
 * Diff a WriterOS package save and queue any changed surface for analysis.
 * Resolves once the pending items are durably persisted — callers should
 * await this before responding to the save request. Analysis itself is
 * kicked off in the background (serially per project) and can never throw
 * back into the caller; a model failure only ever marks its own queue item
 * 'failed'.
 */
export async function observeWriterOSSave(
  input: ObserveWriterOSSaveInput,
  deps: WriterOSObserverDeps = {},
): Promise<{ queuedCount: number }> {
  const changes = detectDocumentChanges(input.priorFiles ?? {}, input.currentFiles)
  const queued = await enqueuePendingItems(input.projectPath, input.projectId, changes)

  if (queued.length > 0) {
    const memoryStore = deps.memoryStore ?? projectMemoryStore
    const provider = deps.provider ?? createModelProvider()
    chainSerially(input.projectId, () => processPendingQueue(memoryStore, provider, input.projectPath, input.projectId))
  }

  return { queuedCount: queued.length }
}
