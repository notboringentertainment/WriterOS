import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  type FileHandle,
} from 'node:fs/promises'
import path from 'node:path'
import { WriterOSProjectManifestSchema } from '../../client/src/lib/projectPackage'
import {
  ProjectMemoryActionSchema,
  ProjectMemoryEventSchema,
  ProjectMemorySnapshotSchema,
  PublishMemoryInputSchema,
  type ParsedPublishMemoryInput,
  type ProjectMemoryAction,
  type ProjectMemoryConflict,
  type ProjectMemoryEvent,
  type ProjectMemoryRecord,
  type ProjectMemorySnapshot,
  type MemorySource,
  type PublishMemoryInput,
  type PublishResult,
} from '../../shared/projectMemory'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { renderCanonProjection, renderReviewProjection } from './projections'

const MEMORY_DIRECTORY = 'memory'
const LEDGER_FILE = 'ledger.jsonl'
const SNAPSHOT_FILE = 'snapshot.json'
const CANON_FILE = 'canon.md'
const REVIEW_FILE = 'review.md'
const LEGACY_AUTHORITY_MIGRATION_BATCH_SIZE = 100

type ProjectMemoryErrorCode =
  | 'invalid-project'
  | 'project-mismatch'
  | 'corrupt-ledger'
  | 'invalid-input'
  | 'revision-conflict'
  | 'not-found'
  | 'invalid-action'
  | 'unresolved-conflict'
  | 'unsafe-path'

export class ProjectMemoryStoreError extends Error {
  readonly name = 'ProjectMemoryStoreError'

  constructor(
    message: string,
    readonly code: ProjectMemoryErrorCode,
    readonly lineNumber?: number,
  ) {
    super(message)
  }
}

export interface ProjectMemoryStore {
  readSnapshot(projectPath: string): Promise<ProjectMemorySnapshot>
  publish(projectPath: string, input: PublishMemoryInput): Promise<PublishResult>
  applyAction(projectPath: string, action: ProjectMemoryAction): Promise<ProjectMemorySnapshot>
  rebuild(projectPath: string): Promise<ProjectMemorySnapshot>
}

export interface ProjectMemoryStoreTestHooks {
  writeLedgerChunk?(handle: FileHandle, buffer: Buffer, offset: number): Promise<number>
}

export interface ProjectMemoryStoreOptions {
  /** @internal Deterministic filesystem injection for regression tests. */
  testHooks?: ProjectMemoryStoreTestHooks
}

interface ReplayResult {
  snapshot: ProjectMemorySnapshot
  publications: Array<{
    dedupeKey: string
    sourceHash: string
    recordId: string
  }>
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function sameMembers(left: string[], right: string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size && [...leftSet].every(value => rightSet.has(value))
}

function sameOrderedList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sourceHasLegacyUnverifiedAuthority(source: MemorySource): boolean {
  return source.workflow === 'story-wayfinder'
    && source.authority !== undefined
    && 'verification' in source.authority
    && source.authority.verification === 'legacy-unverified'
}

function activeLegacyAuthorityRecordIds(snapshot: ProjectMemorySnapshot): string[] {
  return snapshot.records.filter(record => (
    record.kind === 'canon'
    && record.status === 'active'
    && sourceHasLegacyUnverifiedAuthority(record.source)
  )).map(record => record.id)
}

function stableId(prefix: string, parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
  return `${prefix}_${digest}`
}

function replaceRecord(
  records: ProjectMemoryRecord[],
  recordId: string,
  update: (record: ProjectMemoryRecord) => ProjectMemoryRecord,
): ProjectMemoryRecord[] {
  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) {
    throw new ProjectMemoryStoreError(`Memory record ${recordId} was not found.`, 'corrupt-ledger')
  }
  const next = [...records]
  next[index] = update(records[index])
  return next
}

function corruptLedger(lineNumber: number, detail: string): ProjectMemoryStoreError {
  return new ProjectMemoryStoreError(
    `memory/ledger.jsonl line ${lineNumber} is malformed: ${detail}`,
    'corrupt-ledger',
    lineNumber,
  )
}

async function readProjectId(projectPath: string): Promise<string> {
  try {
    const packageStats = await lstat(projectPath)
    if (!packageStats.isDirectory() || packageStats.isSymbolicLink()) {
      throw new ProjectMemoryStoreError('The WriterOS project path must be a real directory.', 'unsafe-path')
    }
    const raw = await readFile(path.join(projectPath, 'project.json'), 'utf8')
    const parsed = WriterOSProjectManifestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new ProjectMemoryStoreError('project.json is not a valid WriterOS project manifest.', 'invalid-project')
    }
    return parsed.data.projectId
  } catch (error) {
    if (error instanceof ProjectMemoryStoreError) throw error
    throw new ProjectMemoryStoreError(
      `Unable to read the WriterOS project manifest: ${error instanceof Error ? error.message : String(error)}`,
      'invalid-project',
    )
  }
}

async function withProjectLock<T>(
  projectPath: string,
  operation: (projectId: string) => Promise<T>,
): Promise<T> {
  const initialProjectId = await readProjectId(projectPath)
  const lock = await acquirePackageWriteLock({
    workspaceRoot: path.dirname(projectPath),
    projectId: initialProjectId,
  })
  let primaryError: unknown
  try {
    const lockedProjectId = await readProjectId(projectPath)
    if (lockedProjectId !== initialProjectId) {
      throw new ProjectMemoryStoreError('project.json changed identity while acquiring its package lock.', 'project-mismatch')
    }
    return await operation(lockedProjectId)
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      await lock.release()
    } catch (releaseError) {
      if (primaryError === undefined) throw releaseError
    }
  }
}

async function assertMemoryDirectory(memoryPath: string): Promise<boolean> {
  try {
    const stats = await lstat(memoryPath)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new ProjectMemoryStoreError('The project memory path must be a real directory.', 'unsafe-path')
    }
    return true
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false
    throw error
  }
}

async function assertRegularFile(filePath: string): Promise<void> {
  const stats = await lstat(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new ProjectMemoryStoreError(`${path.basename(filePath)} must be a regular file.`, 'unsafe-path')
  }
}

async function ensureLedger(projectPath: string): Promise<string> {
  const memoryPath = path.join(projectPath, MEMORY_DIRECTORY)
  const existed = await assertMemoryDirectory(memoryPath)
  if (!existed) await mkdir(memoryPath, { mode: 0o700 })
  const ledgerPath = path.join(memoryPath, LEDGER_FILE)
  try {
    await assertRegularFile(ledgerPath)
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error
    const existingFiles = await readdir(memoryPath)
    if (existingFiles.some(entry => [SNAPSHOT_FILE, CANON_FILE, REVIEW_FILE].includes(entry))) {
      throw new ProjectMemoryStoreError('memory/ledger.jsonl is missing while derived memory state exists.', 'corrupt-ledger')
    }
    const handle = await open(ledgerPath, 'wx', 0o600)
    await handle.close()
  }
  return ledgerPath
}

function applyEvent(
  state: ReplayResult,
  event: ProjectMemoryEvent,
  lineNumber: number,
): ReplayResult {
  if (event.revision !== state.snapshot.revision + 1) {
    throw corruptLedger(lineNumber, `expected revision ${state.snapshot.revision + 1}, received ${event.revision}.`)
  }

  let records = [...state.snapshot.records]
  let conflicts = [...state.snapshot.conflicts]
  const publications = [...state.publications]
  const knownRecord = (recordId: string) => records.some(record => record.id === recordId)

  if (event.type === 'published') {
    if (event.record.status !== 'candidate' && event.record.status !== 'active') {
      throw corruptLedger(lineNumber, 'published records must begin as candidate or active.')
    }
    if (
      event.record.kind === 'canon'
      && event.record.status === 'active'
      && event.record.source.approval !== 'explicit'
    ) {
      throw corruptLedger(lineNumber, 'a publication cannot activate canon without explicit source approval.')
    }
    if (event.record.kind === 'canon' && event.record.status === 'active' && event.conflicts.length > 0) {
      throw corruptLedger(lineNumber, 'a canon publication with an open conflict cannot be active.')
    }
    if (!sameMembers(event.record.supersedes, event.supersededRecordIds)) {
      throw corruptLedger(lineNumber, 'published supersession links do not match the event mutation.')
    }
    if (state.publications.some(publication => (
      publication.dedupeKey === event.dedupeKey
      && publication.sourceHash === event.record.source.sourceHash
    ))) {
      throw corruptLedger(lineNumber, 'duplicate idempotency event.')
    }
    if (knownRecord(event.record.id)) throw corruptLedger(lineNumber, `duplicate record ${event.record.id}.`)
    let supersessionTargets: ProjectMemoryRecord[]
    try {
      supersessionTargets = event.supersededRecordIds.map(recordId => requireRecord(state.snapshot, recordId))
      validateSupersessionTargets(event.record.kind, event.record.source, supersessionTargets)
    } catch (error) {
      throw corruptLedger(lineNumber, error instanceof Error ? error.message : String(error))
    }
    for (const recordId of event.supersededRecordIds) {
      if (!knownRecord(recordId)) throw corruptLedger(lineNumber, `unknown superseded record ${recordId}.`)
      records = replaceRecord(records, recordId, record => ({
        ...record,
        status: 'superseded',
        updatedAt: event.occurredAt,
      }))
    }
    records.push(event.record)
    for (const conflict of event.conflicts) {
      if (conflicts.some(existing => existing.id === conflict.id)) {
        throw corruptLedger(lineNumber, `duplicate conflict ${conflict.id}.`)
      }
      if (!knownRecord(conflict.leftRecordId) || !knownRecord(conflict.rightRecordId)) {
        throw corruptLedger(lineNumber, `conflict ${conflict.id} refers to an unknown record.`)
      }
      if (conflict.rightRecordId !== event.record.id || conflict.status !== 'open') {
        throw corruptLedger(lineNumber, `published conflict ${conflict.id} has invalid authority state.`)
      }
      conflicts.push(conflict)
    }
    publications.push({
      dedupeKey: event.dedupeKey,
      sourceHash: event.record.source.sourceHash,
      recordId: event.record.id,
    })
  } else if (event.type === 'promoted') {
    let mutation: PromotionMutation
    try {
      mutation = derivePromotionMutation(state.snapshot, event.recordId, event.supersededRecordIds)
    } catch (error) {
      throw corruptLedger(lineNumber, error instanceof Error ? error.message : String(error))
    }
    if (
      !sameOrderedList(event.supersededRecordIds, mutation.targets.map(target => target.id))
      || !sameOrderedList(event.resolvedConflictIds, mutation.resolvedConflictIds)
    ) {
      throw corruptLedger(lineNumber, 'promotion mutations do not match its eligible targets and open conflicts.')
    }
    for (const recordId of event.supersededRecordIds) {
      if (!knownRecord(recordId)) throw corruptLedger(lineNumber, `unknown superseded record ${recordId}.`)
      records = replaceRecord(records, recordId, record => ({ ...record, status: 'superseded', updatedAt: event.occurredAt }))
    }
    records = replaceRecord(records, event.recordId, record => ({
      ...record,
      status: 'active',
      supersedes: unique([...record.supersedes, ...event.supersededRecordIds]),
      updatedAt: event.occurredAt,
    }))
    conflicts = conflicts.map(conflict => {
      if (!event.resolvedConflictIds.includes(conflict.id)) return conflict
      const resolution = conflict.leftRecordId === event.recordId ? 'left' : 'right'
      return { ...conflict, status: 'resolved', resolution }
    })
  } else if (event.type === 'rejected') {
    const rejected = state.snapshot.records.find(record => record.id === event.recordId)
    if (!rejected || rejected.status !== 'candidate') {
      throw corruptLedger(lineNumber, 'only a current candidate may be rejected.')
    }
    records = replaceRecord(records, event.recordId, record => ({ ...record, status: 'rejected', updatedAt: event.occurredAt }))
  } else if (event.type === 'legacy-authority-downgraded') {
    const expectedRecordIds = activeLegacyAuthorityRecordIds(state.snapshot)
      .slice(0, LEGACY_AUTHORITY_MIGRATION_BATCH_SIZE)
    if (!sameOrderedList(event.recordIds, expectedRecordIds) || expectedRecordIds.length === 0) {
      throw corruptLedger(lineNumber, 'legacy authority migration does not match active unverified records.')
    }
    for (const recordId of event.recordIds) {
      records = replaceRecord(records, recordId, record => ({
        ...record,
        status: 'candidate',
        updatedAt: event.occurredAt,
      }))
    }
  } else {
    let mutation: ConflictResolutionMutation
    try {
      mutation = deriveConflictResolutionMutation(state.snapshot, event.conflictId, event.resolution)
    } catch (error) {
      throw corruptLedger(lineNumber, error instanceof Error ? error.message : String(error))
    }
    if (
      !sameOrderedList(event.activatedRecordIds, mutation.activatedRecordIds)
      || !sameOrderedList(event.supersededRecordIds, mutation.supersededRecordIds)
      || !sameOrderedList(event.rejectedRecordIds, mutation.rejectedRecordIds)
    ) {
      throw corruptLedger(lineNumber, 'conflict resolution mutations do not match its open endpoints.')
    }
    conflicts = conflicts.map(candidate => candidate.id === event.conflictId
      ? { ...candidate, status: 'resolved', resolution: event.resolution }
      : candidate)
    for (const recordId of event.activatedRecordIds) {
      if (!knownRecord(recordId)) throw corruptLedger(lineNumber, `unknown activated record ${recordId}.`)
      records = replaceRecord(records, recordId, record => ({ ...record, status: 'active', updatedAt: event.occurredAt }))
    }
    for (const recordId of event.supersededRecordIds) {
      if (!knownRecord(recordId)) throw corruptLedger(lineNumber, `unknown superseded record ${recordId}.`)
      records = replaceRecord(records, recordId, record => ({ ...record, status: 'superseded', updatedAt: event.occurredAt }))
    }
    for (const recordId of event.rejectedRecordIds) {
      if (!knownRecord(recordId)) throw corruptLedger(lineNumber, `unknown rejected record ${recordId}.`)
      records = replaceRecord(records, recordId, record => ({ ...record, status: 'rejected', updatedAt: event.occurredAt }))
    }
    if (event.supersededRecordIds.length > 0 && (event.resolution === 'left' || event.resolution === 'right')) {
      const winnerId = event.resolution === 'left'
        ? mutation.conflict.leftRecordId
        : mutation.conflict.rightRecordId
      records = replaceRecord(records, winnerId, record => ({
        ...record,
        supersedes: unique([...record.supersedes, ...event.supersededRecordIds]),
      }))
    }
  }

  const snapshot = ProjectMemorySnapshotSchema.safeParse({
    schemaVersion: 1,
    projectId: state.snapshot.projectId,
    revision: event.revision,
    records,
    conflicts,
  })
  if (!snapshot.success) throw corruptLedger(lineNumber, snapshot.error.issues[0]?.message ?? 'invalid replay state.')
  return { snapshot: snapshot.data, publications }
}

function migrateLegacyWayfinderPublication(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json
  const event = json as Record<string, unknown>
  if (event.schemaVersion !== 1 || event.type !== 'published') return json
  if (!event.record || typeof event.record !== 'object') return json
  const record = event.record as Record<string, unknown>
  if (record.kind !== 'canon' || record.status !== 'active') return json
  if (!record.source || typeof record.source !== 'object') return json
  const source = record.source as Record<string, unknown>
  if (
    source.workflow !== 'story-wayfinder'
    || source.approval !== 'explicit'
    || source.authority !== undefined
  ) return json

  return {
    ...event,
    record: {
      ...record,
      source: {
        ...source,
        authority: { verification: 'legacy-unverified' },
      },
    },
  }
}

async function replayLedger(ledgerPath: string, projectId: string): Promise<ReplayResult> {
  await assertRegularFile(ledgerPath)
  const raw = await readFile(ledgerPath, 'utf8')
  let state: ReplayResult = {
    snapshot: { schemaVersion: 1, projectId, revision: 0, records: [], conflicts: [] },
    publications: [],
  }
  if (raw.length === 0) return state

  const lines = raw.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const line = lines[index]
    if (line === '' && index === lines.length - 1) continue
    if (line === '') throw corruptLedger(lineNumber, 'blank lines are not valid events.')
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      throw corruptLedger(lineNumber, 'invalid JSON.')
    }
    const parsed = ProjectMemoryEventSchema.safeParse(migrateLegacyWayfinderPublication(json))
    if (!parsed.success) {
      throw corruptLedger(lineNumber, parsed.error.issues[0]?.message ?? 'event schema validation failed.')
    }
    if (parsed.data.projectId !== projectId) {
      throw corruptLedger(lineNumber, `event projectId ${parsed.data.projectId} does not match ${projectId}.`)
    }
    state = applyEvent(state, parsed.data, lineNumber)
  }
  return state
}

async function appendEvent(
  ledgerPath: string,
  event: ProjectMemoryEvent,
  testHooks?: ProjectMemoryStoreTestHooks,
): Promise<void> {
  const parsed = ProjectMemoryEventSchema.parse(event)
  await assertRegularFile(ledgerPath)
  const handle = await open(ledgerPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW)
  try {
    const bytes = Buffer.from(`${JSON.stringify(parsed)}\n`, 'utf8')
    let offset = 0
    while (offset < bytes.length) {
      const bytesWritten = testHooks?.writeLedgerChunk
        ? await testHooks.writeLedgerChunk(handle, bytes, offset)
        : (await handle.write(bytes, offset, bytes.length - offset)).bytesWritten
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.length - offset) {
        throw new ProjectMemoryStoreError('The memory event write made no valid progress.', 'corrupt-ledger')
      }
      offset += bytesWritten
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function replayLedgerWithMigrations(
  ledgerPath: string,
  projectId: string,
  testHooks?: ProjectMemoryStoreTestHooks,
): Promise<ReplayResult> {
  let replayed = await replayLedger(ledgerPath, projectId)
  while (true) {
    const recordIds = activeLegacyAuthorityRecordIds(replayed.snapshot)
      .slice(0, LEGACY_AUTHORITY_MIGRATION_BATCH_SIZE)
    if (recordIds.length === 0) return replayed

    const event = createLegacyAuthorityMigrationEvent(replayed.snapshot, recordIds)
    const next = applyEvent(replayed, event, event.revision)
    await appendEvent(ledgerPath, event, testHooks)
    replayed = next
  }
}

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

function snapshotJson(snapshot: ProjectMemorySnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

async function writeProjections(projectPath: string, snapshot: ProjectMemorySnapshot): Promise<void> {
  const memoryPath = path.join(projectPath, MEMORY_DIRECTORY)
  await atomicReplace(path.join(memoryPath, SNAPSHOT_FILE), snapshotJson(snapshot))
  await atomicReplace(path.join(memoryPath, CANON_FILE), renderCanonProjection(snapshot))
  await atomicReplace(path.join(memoryPath, REVIEW_FILE), renderReviewProjection(snapshot))
}

async function projectionsMatch(projectPath: string, snapshot: ProjectMemorySnapshot): Promise<boolean> {
  const memoryPath = path.join(projectPath, MEMORY_DIRECTORY)
  try {
    const [snapshotContents, canonContents, reviewContents] = await Promise.all([
      readFile(path.join(memoryPath, SNAPSHOT_FILE), 'utf8'),
      readFile(path.join(memoryPath, CANON_FILE), 'utf8'),
      readFile(path.join(memoryPath, REVIEW_FILE), 'utf8'),
    ])
    return snapshotContents === snapshotJson(snapshot)
      && canonContents === renderCanonProjection(snapshot)
      && reviewContents === renderReviewProjection(snapshot)
  } catch {
    return false
  }
}

function requireRecord(snapshot: ProjectMemorySnapshot, recordId: string): ProjectMemoryRecord {
  const record = snapshot.records.find(candidate => candidate.id === recordId)
  if (!record) throw new ProjectMemoryStoreError(`Memory record ${recordId} was not found.`, 'not-found')
  return record
}

function requireSupersessionTargets(
  snapshot: ProjectMemorySnapshot,
  recordId: string,
  targetIds: string[],
): ProjectMemoryRecord[] {
  if (targetIds.includes(recordId)) {
    throw new ProjectMemoryStoreError('A record cannot supersede itself.', 'invalid-action')
  }
  return unique(targetIds).map(targetId => requireRecord(snapshot, targetId))
}

function sameDocumentAnchor(source: MemorySource, record: ProjectMemoryRecord): boolean {
  return record.source.workflow === source.workflow
    && record.source.sourceId === source.sourceId
    && record.source.sourceUri === source.sourceUri
}

function validateSupersessionTargets(
  winnerKind: ProjectMemoryRecord['kind'],
  winnerSource: MemorySource,
  targets: ProjectMemoryRecord[],
): void {
  for (const target of targets) {
    if (target.status !== 'active' || target.kind !== winnerKind) {
      throw new ProjectMemoryStoreError(
        'Supersession requires an active record of the same memory kind.',
        'invalid-action',
      )
    }
    if (winnerKind === 'document_fact' && !sameDocumentAnchor(winnerSource, target)) {
      throw new ProjectMemoryStoreError(
        'Document facts may supersede only the prior active fact at the same document anchor.',
        'invalid-action',
      )
    }
  }
}

function publicationStatus(input: ParsedPublishMemoryInput, hasUnresolvedConflict: boolean) {
  if (input.safety === 'flagged') return 'candidate' as const
  if (input.kind === 'document_fact') return 'active' as const
  if (input.requestedStatus === 'candidate') return 'candidate' as const
  if (input.kind !== 'canon') return 'active' as const
  if (!sourceCanActivateCanon(input.source) || input.safety !== 'clear' || hasUnresolvedConflict) {
    return 'candidate' as const
  }
  return 'active' as const
}

function sourceCanActivateCanon(source: MemorySource): boolean {
  if (source.approval !== 'explicit') return false
  if (source.workflow !== 'story-wayfinder') return true
  return source.authority !== undefined
    && 'mode' in source.authority
    && source.authority.mode === 'hitl'
    && (source.authority.ticketType === 'grill' || source.authority.ticketType === 'sketch')
}

function recordCanActivate(record: ProjectMemoryRecord): boolean {
  if (record.status !== 'candidate' || record.safety !== 'clear') return false
  return record.kind !== 'canon' || sourceCanActivateCanon(record.source)
}

function otherOpenConflicts(
  snapshot: ProjectMemorySnapshot,
  recordId: string,
  excludedConflictIds: string[],
): ProjectMemoryConflict[] {
  return snapshot.conflicts.filter(conflict => (
    conflict.status === 'open'
    && !excludedConflictIds.includes(conflict.id)
    && (conflict.leftRecordId === recordId || conflict.rightRecordId === recordId)
  ))
}

interface PromotionMutation {
  record: ProjectMemoryRecord
  targets: ProjectMemoryRecord[]
  resolvedConflictIds: string[]
}

function derivePromotionMutation(
  snapshot: ProjectMemorySnapshot,
  recordId: string,
  supersedes: string[],
): PromotionMutation {
  const record = requireRecord(snapshot, recordId)
  if (record.kind !== 'canon' || !recordCanActivate(record)) {
    throw new ProjectMemoryStoreError(
      'Only a clear, explicitly approved, authority-eligible canon candidate may be promoted.',
      'invalid-action',
    )
  }
  const targets = requireSupersessionTargets(snapshot, record.id, supersedes)
  validateSupersessionTargets(record.kind, record.source, targets)
  const targetIds = new Set(targets.map(target => target.id))
  const openConflicts = snapshot.conflicts.filter(conflict => (
    conflict.status === 'open'
    && (conflict.leftRecordId === record.id || conflict.rightRecordId === record.id)
  ))
  const unresolved = openConflicts.filter(conflict => {
    const otherId = conflict.leftRecordId === record.id ? conflict.rightRecordId : conflict.leftRecordId
    return !targetIds.has(otherId)
  })
  if (unresolved.length > 0) {
    throw new ProjectMemoryStoreError(
      'Canon cannot be promoted while it has another unresolved conflict.',
      'unresolved-conflict',
    )
  }
  return { record, targets, resolvedConflictIds: openConflicts.map(conflict => conflict.id) }
}

interface ConflictResolutionMutation {
  conflict: ProjectMemoryConflict
  activatedRecordIds: string[]
  supersededRecordIds: string[]
  rejectedRecordIds: string[]
}

function deriveConflictResolutionMutation(
  snapshot: ProjectMemorySnapshot,
  conflictId: string,
  resolution: ProjectMemoryConflict['resolution'],
): ConflictResolutionMutation {
  const conflict = snapshot.conflicts.find(candidate => candidate.id === conflictId)
  if (!conflict) throw new ProjectMemoryStoreError(`Memory conflict ${conflictId} was not found.`, 'not-found')
  if (conflict.status !== 'open' || resolution === undefined) {
    throw new ProjectMemoryStoreError('Only an open conflict may be resolved.', 'invalid-action')
  }
  const left = requireRecord(snapshot, conflict.leftRecordId)
  const right = requireRecord(snapshot, conflict.rightRecordId)
  const mutation: ConflictResolutionMutation = {
    conflict,
    activatedRecordIds: [],
    supersededRecordIds: [],
    rejectedRecordIds: [],
  }
  if (resolution === 'not-conflict') return mutation

  // Cross-class conflicts are informational. In particular, a document fact
  // remains active and nonbinding and can neither replace nor be replaced by canon.
  if (left.kind !== right.kind || left.kind === 'document_fact') return mutation

  const ensureActivatable = (record: ProjectMemoryRecord) => {
    if (record.safety !== 'clear') {
      throw new ProjectMemoryStoreError('The selected conflict record is not safe for activation.', 'invalid-action')
    }
    if (otherOpenConflicts(snapshot, record.id, [conflict.id]).length > 0) {
      throw new ProjectMemoryStoreError(
        'The selected conflict record has another unresolved conflict.',
        'unresolved-conflict',
      )
    }
    if (record.status === 'active') return
    if (!recordCanActivate(record)) {
      throw new ProjectMemoryStoreError('The selected conflict record is not eligible for activation.', 'invalid-action')
    }
    mutation.activatedRecordIds.push(record.id)
  }

  if (resolution === 'both-valid') {
    ensureActivatable(left)
    ensureActivatable(right)
    return mutation
  }

  const winner = resolution === 'left' ? left : right
  const loser = resolution === 'left' ? right : left
  if (winner.status === 'rejected' || winner.status === 'superseded') {
    throw new ProjectMemoryStoreError('Rejected or superseded records cannot win a conflict.', 'invalid-action')
  }
  if (loser.status === 'rejected' || loser.status === 'superseded') {
    throw new ProjectMemoryStoreError('A conflict with a stale endpoint cannot change authority.', 'invalid-action')
  }
  ensureActivatable(winner)
  if (loser.status === 'active') {
    const activeNoncanonWinner = winner.status === 'active' && winner.kind !== 'canon'
    if (winner.status !== 'candidate' && !activeNoncanonWinner) {
      throw new ProjectMemoryStoreError(
        'Only an eligible candidate may supersede an active conflict record.',
        'invalid-action',
      )
    }
    mutation.supersededRecordIds.push(loser.id)
  } else {
    mutation.rejectedRecordIds.push(loser.id)
  }
  return mutation
}

function createPublicationEvent(
  snapshot: ProjectMemorySnapshot,
  input: ParsedPublishMemoryInput,
): Extract<ProjectMemoryEvent, { type: 'published' }> {
  const revision = snapshot.revision + 1
  const occurredAt = new Date().toISOString()
  const recordId = stableId('mem', [input.projectId, input.dedupeKey, input.source.sourceHash])
  const explicitTargets = requireSupersessionTargets(snapshot, recordId, input.supersedes)
  validateSupersessionTargets(input.kind, input.source, explicitTargets)

  let automaticDocumentTargets: ProjectMemoryRecord[] = []
  if (input.kind === 'document_fact') {
    automaticDocumentTargets = snapshot.records.filter(record => (
      record.kind === 'document_fact'
      && record.status === 'active'
      && record.source.workflow === input.source.workflow
      && record.source.sourceId === input.source.sourceId
      && record.source.sourceUri === input.source.sourceUri
    ))
  }

  const supersededRecordIds = unique([
    ...explicitTargets.map(record => record.id),
    ...automaticDocumentTargets.map(record => record.id),
  ])
  const potentiallyAppliedIds = publicationStatus(input, false) === 'active' ? supersededRecordIds : []
  const canonUnresolvedTargets = unique(input.conflictsWith)
    .filter(targetId => !potentiallyAppliedIds.includes(targetId))
    .map(targetId => requireRecord(snapshot, targetId))
  const status = publicationStatus(input, canonUnresolvedTargets.length > 0)
  const appliedSupersessionIds = status === 'active' ? supersededRecordIds : []
  const unresolvedTargets = unique(input.conflictsWith)
    .filter(targetId => !appliedSupersessionIds.includes(targetId))
    .map(targetId => requireRecord(snapshot, targetId))
  const record: ProjectMemoryRecord = {
    id: recordId,
    projectId: input.projectId,
    kind: input.kind,
    status,
    claim: input.claim,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    tags: input.tags,
    entities: input.entities,
    source: input.source,
    evidence: input.evidence,
    safety: input.safety,
    spoiler: input.spoiler,
    supersedes: appliedSupersessionIds,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  }
  const conflicts: ProjectMemoryConflict[] = unresolvedTargets.map(target => ({
    id: stableId('conflict', [target.id, recordId]),
    leftRecordId: target.id,
    rightRecordId: recordId,
    reason: `Published claim conflicts with memory record ${target.id}.`,
    status: 'open',
  }))
  return ProjectMemoryEventSchema.parse({
    schemaVersion: 1,
    id: stableId('event', [input.projectId, String(revision), 'published', recordId]),
    projectId: input.projectId,
    revision,
    occurredAt,
    type: 'published',
    dedupeKey: input.dedupeKey,
    record,
    conflicts,
    supersededRecordIds: appliedSupersessionIds,
  }) as Extract<ProjectMemoryEvent, { type: 'published' }>
}

function createActionEvent(
  snapshot: ProjectMemorySnapshot,
  action: ProjectMemoryAction,
): ProjectMemoryEvent {
  if (action.expectedRevision !== snapshot.revision) {
    throw new ProjectMemoryStoreError(
      `Expected memory revision ${action.expectedRevision}, but current revision is ${snapshot.revision}.`,
      'revision-conflict',
    )
  }
  const revision = snapshot.revision + 1
  const occurredAt = new Date().toISOString()
  const base = {
    schemaVersion: 1 as const,
    id: stableId('event', [snapshot.projectId, String(revision), action.type]),
    projectId: snapshot.projectId,
    revision,
    occurredAt,
  }

  if (action.type === 'promote') {
    const mutation = derivePromotionMutation(snapshot, action.recordId, action.supersedes)
    return ProjectMemoryEventSchema.parse({
      ...base,
      type: 'promoted',
      recordId: mutation.record.id,
      supersededRecordIds: mutation.targets.map(target => target.id),
      resolvedConflictIds: mutation.resolvedConflictIds,
    })
  }

  if (action.type === 'reject') {
    const record = requireRecord(snapshot, action.recordId)
    if (record.status !== 'candidate') {
      throw new ProjectMemoryStoreError('Only a candidate may be rejected.', 'invalid-action')
    }
    return ProjectMemoryEventSchema.parse({ ...base, type: 'rejected', recordId: record.id })
  }

  const mutation = deriveConflictResolutionMutation(snapshot, action.conflictId, action.resolution)
  return ProjectMemoryEventSchema.parse({
    ...base,
    type: 'conflict-resolved',
    conflictId: mutation.conflict.id,
    resolution: action.resolution,
    activatedRecordIds: mutation.activatedRecordIds,
    supersededRecordIds: mutation.supersededRecordIds,
    rejectedRecordIds: mutation.rejectedRecordIds,
  })
}

function createLegacyAuthorityMigrationEvent(
  snapshot: ProjectMemorySnapshot,
  recordIds: string[],
): Extract<ProjectMemoryEvent, { type: 'legacy-authority-downgraded' }> {
  const revision = snapshot.revision + 1
  const occurredAt = new Date().toISOString()
  return ProjectMemoryEventSchema.parse({
    schemaVersion: 1,
    id: stableId('event', [snapshot.projectId, String(revision), 'legacy-authority-downgraded']),
    projectId: snapshot.projectId,
    revision,
    occurredAt,
    type: 'legacy-authority-downgraded',
    recordIds,
  }) as Extract<ProjectMemoryEvent, { type: 'legacy-authority-downgraded' }>
}

export function createProjectMemoryStore(options: ProjectMemoryStoreOptions = {}): ProjectMemoryStore {
  return {
    async readSnapshot(projectPath) {
      return withProjectLock(projectPath, async projectId => {
        const ledgerPath = await ensureLedger(projectPath)
        const replayed = await replayLedgerWithMigrations(ledgerPath, projectId, options.testHooks)
        if (!await projectionsMatch(projectPath, replayed.snapshot)) {
          await writeProjections(projectPath, replayed.snapshot)
        }
        return replayed.snapshot
      })
    },

    async publish(projectPath, rawInput) {
      const parsed = PublishMemoryInputSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new ProjectMemoryStoreError(parsed.error.issues[0]?.message ?? 'Invalid memory publication.', 'invalid-input')
      }
      const input = parsed.data
      const manifestProjectId = await readProjectId(projectPath)
      if (input.projectId !== manifestProjectId) {
        throw new ProjectMemoryStoreError(
          `Publication projectId ${input.projectId} does not match project.json projectId ${manifestProjectId}.`,
          'project-mismatch',
        )
      }

      return withProjectLock(projectPath, async projectId => {
        if (input.projectId !== projectId) {
          throw new ProjectMemoryStoreError('Publication projectId does not match the locked project.', 'project-mismatch')
        }
        const ledgerPath = await ensureLedger(projectPath)
        const replayed = await replayLedgerWithMigrations(ledgerPath, projectId, options.testHooks)
        const duplicate = replayed.publications.find(publication => (
          publication.dedupeKey === input.dedupeKey
          && publication.sourceHash === input.source.sourceHash
        ))
        if (duplicate) {
          const record = requireRecord(replayed.snapshot, duplicate.recordId)
          if (!await projectionsMatch(projectPath, replayed.snapshot)) {
            await writeProjections(projectPath, replayed.snapshot)
          }
          return { published: false, record, snapshot: replayed.snapshot }
        }

        const event = createPublicationEvent(replayed.snapshot, input)
        const next = applyEvent(replayed, event, event.revision)
        await appendEvent(ledgerPath, event, options.testHooks)
        await writeProjections(projectPath, next.snapshot)
        return { published: true, record: event.record, snapshot: next.snapshot }
      })
    },

    async applyAction(projectPath, rawAction) {
      const parsed = ProjectMemoryActionSchema.safeParse(rawAction)
      if (!parsed.success) {
        throw new ProjectMemoryStoreError(parsed.error.issues[0]?.message ?? 'Invalid project memory action.', 'invalid-input')
      }
      return withProjectLock(projectPath, async projectId => {
        const ledgerPath = await ensureLedger(projectPath)
        const replayed = await replayLedgerWithMigrations(ledgerPath, projectId, options.testHooks)
        const event = createActionEvent(replayed.snapshot, parsed.data)
        const next = applyEvent(replayed, event, event.revision)
        await appendEvent(ledgerPath, event, options.testHooks)
        await writeProjections(projectPath, next.snapshot)
        return next.snapshot
      })
    },

    async rebuild(projectPath) {
      return withProjectLock(projectPath, async projectId => {
        const ledgerPath = await ensureLedger(projectPath)
        const replayed = await replayLedgerWithMigrations(ledgerPath, projectId, options.testHooks)
        await writeProjections(projectPath, replayed.snapshot)
        return replayed.snapshot
      })
    },
  }
}

export const projectMemoryStore = createProjectMemoryStore()
