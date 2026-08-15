// Writers' Room -> project memory bridge (Task 8). Room state lives in
// Supabase and that commit is always the authoritative transaction; this
// module is a best-effort mirror into the project's `.writeros` memory
// ledger. It never throws — every entry point catches its own failures and
// reports a status instead, so a memory-sync problem can never fail a room
// write. Reconciliation keys off immutable room source ids (block labels,
// meeting-decision row ids) so retrying a sync is always idempotent.

import { createHash } from 'node:crypto'
import { loadProjectLibraryConfig } from '../projectLibrary/config'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../projectLibrary/store'
import { parseOpenQuestionsBlock } from '../room/interview/banking'
import type { MeetingDecisionRow } from '../room/interview/types'
import { SHARED_BLOCK_CONTRACT } from '../room/memoryContract'
import type { MemoryKind, MemorySource, PublishMemoryInput, ProjectMemoryRecord } from '../../shared/projectMemory'
import { projectMemoryStore, type ProjectMemoryStore } from './store'

const ROOM_WORKFLOW: MemorySource['workflow'] = 'writeros-room'

export type RoomMemoryBridgeStatus = 'synced' | 'disabled' | 'pending'

export interface RoomMemoryBridgeOutcome {
  status: RoomMemoryBridgeStatus
  publishedCount: number
  message?: string
}

export interface RoomMemoryBridgeDeps {
  memoryStore?: ProjectMemoryStore
  resolveProjectPath?(projectId: string): Promise<string | null>
}

// ---- lazy, cached project-library resolution -------------------------------
// Room modules only know a room projectId (the same id space as `.writeros`
// packages). There is no ambient ProjectLibraryStore singleton elsewhere in
// the codebase, so one is constructed lazily here, once per process, from
// the same env configuration server/routes.ts uses at startup.

let cachedLibraryStore: Promise<ProjectLibraryStore | null> | null = null

async function defaultProjectLibraryStore(): Promise<ProjectLibraryStore | null> {
  if (!cachedLibraryStore) {
    cachedLibraryStore = (async () => {
      const config = await loadProjectLibraryConfig(process.env)
      if (!config.enabled || !config.rootPath) return null
      return createProjectLibraryStore(config.rootPath)
    })().catch(() => null)
  }
  return cachedLibraryStore
}

async function defaultResolveProjectPath(projectId: string): Promise<string | null> {
  const libraryStore = await defaultProjectLibraryStore()
  if (!libraryStore) return null
  try {
    return await libraryStore.resolveProjectPackagePath(projectId)
  } catch {
    return null
  }
}

// ---- shared helpers ---------------------------------------------------------

function sentinelFor(label: string): string | undefined {
  return SHARED_BLOCK_CONTRACT.find(block => block.label === label)?.sentinel
}

function isMeaningfulBlockValue(label: string, value: string): boolean {
  return value.trim().length > 0 && value !== sentinelFor(label)
}

function contentHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] ?? ''
}

function roomSource(sourceId: string, sourceUri: string, hash: string, capturedAt: string): MemorySource {
  return {
    workflow: ROOM_WORKFLOW,
    sourceId,
    sourceUri,
    sourceHash: hash,
    capturedAt,
    // A writer banking a Meeting round or syncing story locks is an explicit
    // action — this is the "a lock IS explicit approval" exception the
    // memory model carves out for the room.
    approval: 'explicit',
  }
}

async function priorActiveRoomRecord(
  memoryStore: ProjectMemoryStore,
  projectPath: string,
  kind: MemoryKind,
  sourceId: string,
): Promise<ProjectMemoryRecord | undefined> {
  const snapshot = await memoryStore.readSnapshot(projectPath)
  return snapshot.records.find(record => (
    record.status === 'active'
    && record.kind === kind
    && record.source.workflow === ROOM_WORKFLOW
    && record.source.sourceId === sourceId
  ))
}

function failureOutcome(error: unknown): RoomMemoryBridgeOutcome {
  return {
    status: 'pending',
    publishedCount: 0,
    message: error instanceof Error ? error.message : 'memory sync failed',
  }
}

// ---- story_locks -> explicit canon ------------------------------------------

export async function bridgeStoryLocksToMemory(
  input: { projectId: string; storyLocksValue: string; capturedAt?: string },
  deps: RoomMemoryBridgeDeps = {},
): Promise<RoomMemoryBridgeOutcome> {
  if (!isMeaningfulBlockValue('story_locks', input.storyLocksValue)) {
    return { status: 'disabled', publishedCount: 0 }
  }
  const memoryStore = deps.memoryStore ?? projectMemoryStore
  const resolveProjectPath = deps.resolveProjectPath ?? defaultResolveProjectPath
  try {
    const projectPath = await resolveProjectPath(input.projectId)
    if (!projectPath) return { status: 'disabled', publishedCount: 0 }
    const sourceId = 'story_locks'
    const capturedAt = input.capturedAt ?? new Date().toISOString()
    const hash = contentHash(input.storyLocksValue)
    const prior = await priorActiveRoomRecord(memoryStore, projectPath, 'canon', sourceId)
    const publishInput: PublishMemoryInput = {
      projectId: input.projectId,
      dedupeKey: `writeros-room:story_locks:${input.projectId}`,
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'Room story locks are in force for this project.',
      detail: truncate(input.storyLocksValue, 8_000),
      tags: ['story_locks'],
      entities: [],
      source: roomSource(sourceId, 'writeros-room:story_locks', hash, capturedAt),
      evidence: [{ excerpt: truncate(input.storyLocksValue, 1_500) }],
      safety: 'clear',
      spoiler: false,
      supersedes: prior ? [prior.id] : [],
    }
    const result = await memoryStore.publish(projectPath, publishInput)
    return { status: 'synced', publishedCount: result.published ? 1 : 0 }
  } catch (error) {
    return failureOutcome(error)
  }
}

// ---- concept_seed / project_state -> development ---------------------------

interface DevelopmentBlock {
  label: 'concept_seed' | 'project_state'
  tag: string
  value: string | undefined
}

async function bridgeDevelopmentBlock(
  memoryStore: ProjectMemoryStore,
  projectPath: string,
  projectId: string,
  block: DevelopmentBlock,
  capturedAt: string,
): Promise<number> {
  if (block.value === undefined || !isMeaningfulBlockValue(block.label, block.value)) return 0
  const hash = contentHash(block.value)
  const prior = await priorActiveRoomRecord(memoryStore, projectPath, 'development', block.label)
  const publishInput: PublishMemoryInput = {
    projectId,
    dedupeKey: `writeros-room:${block.label}:${projectId}`,
    kind: 'development',
    requestedStatus: 'active',
    claim: truncate(firstLine(block.value) || `Room ${block.tag} update`, 600),
    detail: truncate(block.value, 8_000),
    tags: [block.tag],
    entities: [],
    source: roomSource(block.label, `writeros-room:${block.label}`, hash, capturedAt),
    evidence: [{ excerpt: truncate(block.value, 1_500) }],
    safety: 'clear',
    spoiler: false,
    supersedes: prior ? [prior.id] : [],
  }
  const result = await memoryStore.publish(projectPath, publishInput)
  return result.published ? 1 : 0
}

// ---- open_questions -> open_question records --------------------------------

async function bridgeOpenQuestions(
  memoryStore: ProjectMemoryStore,
  projectPath: string,
  projectId: string,
  openQuestionsValue: string | undefined,
  capturedAt: string,
): Promise<number> {
  if (openQuestionsValue === undefined || !isMeaningfulBlockValue('open_questions', openQuestionsValue)) return 0
  let publishedCount = 0
  for (const question of parseOpenQuestionsBlock(openQuestionsValue)) {
    if (!question.trim()) continue
    const questionHash = contentHash(question).slice(0, 16)
    const sourceId = `open_questions:${questionHash}`
    const publishInput: PublishMemoryInput = {
      projectId,
      dedupeKey: `writeros-room:open_question:${projectId}:${sourceId}`,
      kind: 'open_question',
      requestedStatus: 'active',
      claim: truncate(question, 600),
      tags: ['open_questions'],
      entities: [],
      source: roomSource(sourceId, `writeros-room:open_questions::${questionHash}`, contentHash(question), capturedAt),
      evidence: [{ excerpt: truncate(question, 1_500) }],
      safety: 'clear',
      spoiler: false,
      supersedes: [],
    }
    const result = await memoryStore.publish(projectPath, publishInput)
    if (result.published) publishedCount += 1
  }
  return publishedCount
}

export async function bridgeRoomStateToMemory(
  input: {
    projectId: string
    conceptSeed?: string
    projectState?: string
    openQuestions?: string
    capturedAt?: string
  },
  deps: RoomMemoryBridgeDeps = {},
): Promise<RoomMemoryBridgeOutcome> {
  const memoryStore = deps.memoryStore ?? projectMemoryStore
  const resolveProjectPath = deps.resolveProjectPath ?? defaultResolveProjectPath
  const capturedAt = input.capturedAt ?? new Date().toISOString()
  try {
    const projectPath = await resolveProjectPath(input.projectId)
    if (!projectPath) return { status: 'disabled', publishedCount: 0 }

    let publishedCount = 0
    publishedCount += await bridgeDevelopmentBlock(
      memoryStore, projectPath, input.projectId,
      { label: 'concept_seed', tag: 'concept_seed', value: input.conceptSeed }, capturedAt,
    )
    publishedCount += await bridgeDevelopmentBlock(
      memoryStore, projectPath, input.projectId,
      { label: 'project_state', tag: 'project_state', value: input.projectState }, capturedAt,
    )
    publishedCount += await bridgeOpenQuestions(memoryStore, projectPath, input.projectId, input.openQuestions, capturedAt)

    return { status: 'synced', publishedCount }
  } catch (error) {
    return failureOutcome(error)
  }
}

// ---- adopted Meeting decisions -> decisions or canon -------------------------

export async function bridgeMeetingDecisionsToMemory(
  input: { projectId: string; decisions: readonly MeetingDecisionRow[] },
  deps: RoomMemoryBridgeDeps = {},
): Promise<RoomMemoryBridgeOutcome> {
  const memoryStore = deps.memoryStore ?? projectMemoryStore
  const resolveProjectPath = deps.resolveProjectPath ?? defaultResolveProjectPath
  try {
    const projectPath = await resolveProjectPath(input.projectId)
    if (!projectPath) return { status: 'disabled', publishedCount: 0 }

    let publishedCount = 0
    for (const row of input.decisions) {
      if (!('statement' in row.content) || !row.content.statement.trim()) continue
      // locked decisions are binding -> explicit canon; leaning/open stay
      // nonbinding decisions per the room's own classification.
      const kind: MemoryKind = row.content.mutability === 'locked' ? 'canon' : 'decision'
      const snapshot = await memoryStore.readSnapshot(projectPath)
      const supersedes = row.targets
        .map(targetId => snapshot.records.find(record => (
          record.status === 'active'
          && record.kind === kind
          && record.source.workflow === ROOM_WORKFLOW
          && record.source.sourceId === targetId
        )))
        .filter((record): record is ProjectMemoryRecord => Boolean(record))
        .map(record => record.id)
      const hash = contentHash(JSON.stringify(row.content))
      const publishInput: PublishMemoryInput = {
        projectId: input.projectId,
        dedupeKey: `writeros-room:meeting-decision:${row.id}`,
        kind,
        requestedStatus: 'active',
        claim: truncate(row.content.statement, 600),
        tags: [row.area],
        entities: [],
        source: roomSource(row.id, `writeros-room:meeting-decision:${row.area}`, hash, row.created_at),
        evidence: [{ excerpt: truncate(row.content.statement, 1_500) }],
        safety: 'clear',
        spoiler: false,
        supersedes,
      }
      const result = await memoryStore.publish(projectPath, publishInput)
      if (result.published) publishedCount += 1
    }
    return { status: 'synced', publishedCount }
  } catch (error) {
    return failureOutcome(error)
  }
}

// ---- convenience orchestrator for a completed Meeting bank -------------------

export async function bridgeMeetingBankToMemory(
  input: {
    projectId: string
    conceptSeed: string
    storyLocks: string
    openQuestions: string
    decisions: readonly MeetingDecisionRow[]
  },
  deps: RoomMemoryBridgeDeps = {},
): Promise<RoomMemoryBridgeOutcome> {
  const results = await Promise.all([
    bridgeStoryLocksToMemory({ projectId: input.projectId, storyLocksValue: input.storyLocks }, deps),
    bridgeRoomStateToMemory({ projectId: input.projectId, conceptSeed: input.conceptSeed, openQuestions: input.openQuestions }, deps),
    bridgeMeetingDecisionsToMemory({ projectId: input.projectId, decisions: input.decisions }, deps),
  ])
  const publishedCount = results.reduce((sum, result) => sum + result.publishedCount, 0)
  if (results.some(result => result.status === 'pending')) {
    return { status: 'pending', publishedCount, message: 'banked, memory sync pending' }
  }
  if (results.every(result => result.status === 'disabled')) {
    return { status: 'disabled', publishedCount: 0 }
  }
  return { status: 'synced', publishedCount }
}
