import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants } from 'node:fs'
import { lstat, open, rename, rm } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { WriterOSProjectManifestSchema } from '../../client/src/lib/projectPackage'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { buildMemoryContext, citationLabelsForRecords } from './retrieval'
import { renderMemoryContextMarkdown } from './renderContext'
import {
  ProjectMemoryStoreError,
  priorVersionRecords,
  projectMemoryStore,
  publicationRecordId,
  type ProjectMemoryStore,
} from './store'
import type { MemoryContextPackage } from '../../shared/projectMemory'
import {
  MemoryWorkflowSchema,
  ProjectMemoryImportCountsSchema,
  PublishMemoryInputSchema,
  type ProjectMemoryImportCounts,
  type PublishMemoryInput,
} from '../../shared/projectMemory'
import { z } from 'zod'
import {
  guardExistingPath,
  UnsafeProjectMemoryPathError,
  type SafeExistingPath,
} from './safePaths'
import { previewProjectMemoryImport } from './importer'
import { annotationStore, AnnotationStoreError } from './annotationStore'
import { readWhatsStandingReport } from './whatsStandingReport'
import { renderComposedMarkdown } from '../compose/renderComposedMarkdown'

export interface ProjectMemoryCliIo {
  stdout(value: string): void
  stderr(value: string): void
}

export interface ProjectMemoryImportPreview {
  source: z.infer<typeof MemoryWorkflowSchema>
  projectId: string
  records: PublishMemoryInput[]
  warnings: string[]
  duplicates: number
  counts: ProjectMemoryImportCounts
  ticketFiles?: string[]
  ticketQuestions?: Record<string, string>
}

export interface ProjectMemoryCliDependencies {
  importPreview?(input: {
    source: 'wayfinder' | 'pitchstudio' | 'buzz'
    projectId: string
    sourceRoot: string
    linkedSourceId?: string
  }): Promise<ProjectMemoryImportPreview>
  /** @internal Deterministic same-inode growth injection for regression tests. */
  beforePublishInputRead?(inputPath: string): Promise<void>
  /** @internal Deterministic project-directory swap injection for regression tests. */
  beforeLinkSourceLockedRead?(projectPath: string): Promise<void>
  /** @internal Store injection for deterministic durability regression tests. */
  memoryStore?: ProjectMemoryStore
}

const MAX_PUBLISH_INPUT_BYTES = 1_000_000

const processIo: ProjectMemoryCliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value),
}

class CliInputError extends Error {}

type CliImportProgress =
  | {
      durability: 'reconciled'
      appliedCount: number
      lastRevision: number
    }
  | {
      durability: 'unknown'
      lastKnownAppliedCount: number
      lastKnownRevision: number
    }

class CliImportPartialError extends Error {
  readonly name = 'CliImportPartialError'

  constructor(readonly progress: CliImportProgress) {
    super('A project memory import stopped after earlier records became durable.')
  }
}

interface ParsedArguments {
  command: string
  values: Map<string, string>
  flags: Set<string>
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command, ...tokens] = argv
  if (!command || command.startsWith('-')) throw new CliInputError('A memory command is required.')
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--')) throw new CliInputError('Unexpected positional argument.')
    const name = token.slice(2)
    if (!name || values.has(name) || flags.has(name)) throw new CliInputError('Duplicate or empty option.')
    const next = tokens[index + 1]
    if (next === undefined || next.startsWith('--')) {
      flags.add(name)
      continue
    }
    values.set(name, next)
    index += 1
  }
  return { command, values, flags }
}

function requiredValue(args: ParsedArguments, name: string): string {
  const value = args.values.get(name)?.trim()
  if (!value) throw new CliInputError(`--${name} is required.`)
  return value
}

function absoluteProjectPath(args: ParsedArguments): string {
  const projectPath = requiredValue(args, 'project')
  if (!path.isAbsolute(projectPath)) throw new CliInputError('--project must be an absolute path.')
  return projectPath
}

async function safeProjectPath(args: ParsedArguments): Promise<SafeExistingPath> {
  return guardExistingPath(absoluteProjectPath(args), 'directory')
}

function assertAllowedOptions(
  args: ParsedArguments,
  values: readonly string[],
  flags: readonly string[] = [],
): void {
  const allowedValues = new Set(values)
  const allowedFlags = new Set(flags)
  if ([...args.values.keys()].some(name => !allowedValues.has(name))) {
    throw new CliInputError('Unknown command option.')
  }
  if ([...args.flags].some(name => !allowedFlags.has(name))) {
    throw new CliInputError('Unknown command flag.')
  }
}

async function runContext(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'query', 'format', 'surface', 'persona', 'entity'])
  const project = await safeProjectPath(args)
  const projectPath = project.path
  const format = args.values.get('format') ?? 'json'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')
  await project.verify()
  const snapshot = await projectMemoryStore.readSnapshot(projectPath)
  const context = buildMemoryContext(snapshot, {
    message: args.values.get('query') ?? '',
    ...(args.values.has('surface') ? { surface: args.values.get('surface') } : {}),
    ...(args.values.has('persona') ? { personaId: args.values.get('persona') } : {}),
    ...(args.values.has('entity') ? { currentEntities: [args.values.get('entity') as string] } : {}),
  })
  io.stdout(format === 'markdown'
    ? renderMemoryContextMarkdown(context, { includeSpoilers: true })
    : `${JSON.stringify(context, null, 2)}\n`)
  return 0
}

async function readBoundedFile(handle: Awaited<ReturnType<typeof open>>): Promise<string> {
  const buffer = Buffer.alloc(MAX_PUBLISH_INPUT_BYTES + 1)
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  if (offset > MAX_PUBLISH_INPUT_BYTES) {
    throw new CliInputError('The input must be a bounded regular file.')
  }
  return buffer.subarray(0, offset).toString('utf8')
}

async function readSafeJsonInput(
  inputPath: string,
  dependencies: ProjectMemoryCliDependencies,
): Promise<unknown> {
  const guarded = await guardExistingPath(inputPath, 'file')
  const resolved = guarded.path
  const stats = await lstat(resolved)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_PUBLISH_INPUT_BYTES) {
    throw new CliInputError('The input must be a bounded regular file.')
  }
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== stats.dev || opened.ino !== stats.ino) {
      throw new CliInputError('The input file changed while opening it.')
    }
    await dependencies.beforePublishInputRead?.(resolved)
    await guarded.verify()
    const rechecked = await handle.stat()
    if (
      !rechecked.isFile()
      || rechecked.dev !== stats.dev
      || rechecked.ino !== stats.ino
      || rechecked.size > MAX_PUBLISH_INPUT_BYTES
    ) {
      throw new CliInputError('The input must be a stable bounded regular file.')
    }
    try {
      return JSON.parse(await readBoundedFile(handle))
    } catch (error) {
      if (error instanceof SyntaxError) throw new CliInputError('The input is not valid JSON.')
      throw error
    }
  } finally {
    await handle.close()
  }
}

async function runPublish(
  args: ParsedArguments,
  io: ProjectMemoryCliIo,
  dependencies: ProjectMemoryCliDependencies,
): Promise<number> {
  assertAllowedOptions(args, ['project', 'input'])
  const project = await safeProjectPath(args)
  const projectPath = project.path
  const input = await readSafeJsonInput(requiredValue(args, 'input'), dependencies)
  await project.verify()
  const result = await projectMemoryStore.publish(projectPath, input as PublishMemoryInput)
  io.stdout(`${JSON.stringify({
    published: result.published,
    record: result.record,
    revision: result.snapshot.revision,
  }, null, 2)}\n`)
  return 0
}

function withoutSpoilers(context: MemoryContextPackage): MemoryContextPackage {
  const hiddenIds = new Set(
    [...context.activeCanon, ...context.relevant]
      .filter(record => record.spoiler)
      .map(record => record.id),
  )
  const activeCanon = context.activeCanon.filter(record => !hiddenIds.has(record.id))
  const relevant = context.relevant.filter(record => !hiddenIds.has(record.id))
  const conflicts = context.conflicts.filter(conflict => (
    !hiddenIds.has(conflict.leftRecordId)
    && !hiddenIds.has(conflict.rightRecordId)
    && !context.spoilerConflictIds.includes(conflict.id)
  ))
  const visibleRecords = [...activeCanon, ...relevant]
  const labels = citationLabelsForRecords(visibleRecords)
  return {
    ...context,
    activeCanon,
    relevant,
    conflicts,
    spoilerConflictIds: [],
    citationMap: Object.fromEntries(visibleRecords.map(record => [
      labels.get(record.id) as string,
      record.source,
    ])),
  }
}

async function runExport(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(
    args,
    ['project', 'query', 'format', 'surface', 'persona', 'entity'],
    ['include-spoilers'],
  )
  const project = await safeProjectPath(args)
  const projectPath = project.path
  const format = args.values.get('format') ?? 'markdown'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')
  await project.verify()
  const snapshot = await projectMemoryStore.readSnapshot(projectPath)
  const context = buildMemoryContext(snapshot, {
    message: args.values.get('query') ?? '',
    ...(args.values.has('surface') ? { surface: args.values.get('surface') } : {}),
    ...(args.values.has('persona') ? { personaId: args.values.get('persona') } : {}),
    ...(args.values.has('entity') ? { currentEntities: [args.values.get('entity') as string] } : {}),
  })
  const includeSpoilers = args.flags.has('include-spoilers')
  io.stdout(format === 'markdown'
    ? renderMemoryContextMarkdown(context, { includeSpoilers })
    : `${JSON.stringify(includeSpoilers ? context : withoutSpoilers(context), null, 2)}\n`)
  return 0
}

async function atomicWriteManifest(projectPath: string, manifest: unknown): Promise<void> {
  const manifestPath = path.join(projectPath, 'project.json')
  const temporaryPath = path.join(projectPath, `.project.${randomBytes(12).toString('hex')}.tmp`)
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, manifestPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function readSafeManifest(projectPath: string) {
  const manifestPath = path.join(projectPath, 'project.json')
  const before = await lstat(manifestPath)
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new ProjectMemoryStoreError('project.json must be a regular file.', 'unsafe-path')
  }
  const handle = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new ProjectMemoryStoreError('project.json changed while opening it.', 'unsafe-path')
    }
    let json: unknown
    try {
      json = JSON.parse(await handle.readFile('utf8'))
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ProjectMemoryStoreError('project.json is not valid JSON.', 'invalid-project')
      }
      throw error
    }
    const manifest = WriterOSProjectManifestSchema.safeParse(json)
    if (!manifest.success) {
      throw new ProjectMemoryStoreError('project.json is invalid.', 'invalid-project')
    }
    return manifest.data
  } finally {
    await handle.close()
  }
}

async function runLinkSource(
  args: ParsedArguments,
  io: ProjectMemoryCliIo,
  dependencies: ProjectMemoryCliDependencies,
): Promise<number> {
  assertAllowedOptions(args, ['project', 'workflow', 'source-id'])
  const project = await safeProjectPath(args)
  const projectPath = project.path
  if (requiredValue(args, 'workflow') !== 'buzz') {
    throw new CliInputError('Only the Buzz source linkage is supported.')
  }
  const sourceId = requiredValue(args, 'source-id')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceId)) {
    throw new CliInputError('The source id must be opaque and path-free.')
  }
  const initial = await readSafeManifest(projectPath)
  const lock = await acquirePackageWriteLock({
    workspaceRoot: path.dirname(projectPath),
    projectId: initial.projectId,
  })
  let primaryError: unknown
  try {
    await dependencies.beforeLinkSourceLockedRead?.(projectPath)
    await project.verify()
    const locked = await readSafeManifest(projectPath)
    if (locked.projectId !== initial.projectId) {
      throw new CliInputError('project.json changed while acquiring its lock.')
    }
    const linked = locked.sources?.buzzChannelId !== sourceId
    if (linked) {
      await project.verify()
      await atomicWriteManifest(projectPath, {
        ...locked,
        sources: { ...locked.sources, buzzChannelId: sourceId },
      })
    }
    io.stdout(`${JSON.stringify({ linked, workflow: 'buzz', sourceId }, null, 2)}\n`)
    return 0
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      await lock.release()
    } catch (error) {
      if (primaryError === undefined) throw error
    }
  }
}

const ImportPreviewSchema = z.object({
  source: MemoryWorkflowSchema,
  projectId: z.string().min(1),
  records: z.array(PublishMemoryInputSchema),
  warnings: z.array(z.string()),
  duplicates: z.number().int().nonnegative(),
  counts: ProjectMemoryImportCountsSchema,
  ticketFiles: z.array(z.string().min(1).max(2_000)).max(10_000).optional(),
  ticketQuestions: z.record(z.string().min(1).max(2_000), z.string().max(600)).optional(),
}).strict().superRefine((preview, context) => {
  const expected: ProjectMemoryImportCounts = {
    activeCanon: preview.records.filter(record => (
      record.kind === 'canon' && record.requestedStatus === 'active'
    )).length,
    candidates: preview.records.filter(record => record.requestedStatus === 'candidate').length,
    development: preview.records.filter(record => record.kind === 'development').length,
    openQuestions: preview.records.filter(record => record.kind === 'open_question').length,
    conflicts: preview.records.reduce((total, record) => (
      total
      + record.conflictsWith.length
      + (record.tags.includes('memory:conflict') ? 1 : 0)
    ), 0),
    duplicates: preview.duplicates,
    flagged: preview.records.filter(record => record.safety === 'flagged').length,
  }
  for (const [name, value] of Object.entries(expected) as [keyof ProjectMemoryImportCounts, number][]) {
    if (preview.counts[name] !== value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['counts', name],
        message: `Import preview ${name} count does not match its records.`,
      })
    }
  }
})

async function loadImportPreview(input: {
  source: 'wayfinder' | 'pitchstudio' | 'buzz'
  projectId: string
  sourceRoot: string
  linkedSourceId?: string
}): Promise<ProjectMemoryImportPreview> {
  return previewProjectMemoryImport(input)
}

type QuestionRecords = Awaited<ReturnType<ProjectMemoryStore['readSnapshotReadOnly']>>['records']

/**
 * Rename check: a resolved ticket whose open file was renamed on the way to
 * resolved/ has no basename match, but its Question text is unchanged. Find
 * active open-question records whose file is gone and whose claim equals the
 * resolved ticket's question text. One removed ticket path is a match; more
 * than one is ambiguous and left alone.
 */
function findRenamedQuestions(
  records: QuestionRecords,
  resolvedSourceId: string,
  questionText: string | undefined,
  ticketFiles: ReadonlySet<string>,
): { openPath: string; records: QuestionRecords } | { ambiguousPaths: string[] } | undefined {
  if (!questionText) return undefined
  const basenamePath = `tickets/${resolvedSourceId.slice('resolved/'.length)}`
  const matches = records.filter(record => (
    record.status === 'active'
    && record.kind === 'open_question'
    && record.source.workflow === 'story-wayfinder'
    && record.source.sourceId.startsWith('tickets/')
    && record.source.sourceId !== basenamePath
    && !ticketFiles.has(record.source.sourceId)
    && record.claim === questionText
  ))
  if (matches.length === 0) return undefined
  const paths = [...new Set(matches.map(record => record.source.sourceId))].sort()
  if (paths.length > 1) return { ambiguousPaths: paths }
  return { openPath: paths[0], records: matches }
}

async function runImport(
  args: ParsedArguments,
  io: ProjectMemoryCliIo,
  dependencies: ProjectMemoryCliDependencies,
): Promise<number> {
  assertAllowedOptions(args, ['project', 'source', 'from'], ['dry-run', 'apply'])
  const dryRun = args.flags.has('dry-run')
  const apply = args.flags.has('apply')
  if (dryRun === apply) throw new CliInputError('Import requires exactly one of --dry-run or --apply.')
  const project = await safeProjectPath(args)
  const projectPath = project.path
  const source = requiredValue(args, 'source')
  if (source !== 'wayfinder' && source !== 'pitchstudio' && source !== 'buzz') {
    throw new CliInputError('Unsupported import source.')
  }
  const sourceGuard = await guardExistingPath(requiredValue(args, 'from'), 'directory')
  const sourceRoot = sourceGuard.path
  const memoryStore = dependencies.memoryStore ?? projectMemoryStore
  await project.verify()
  // Dry-run promises a read-only preview: readSnapshot() can initialize the
  // ledger, append migration events and repair projections, so it is only
  // used on the apply path.
  const snapshot = dryRun
    ? await memoryStore.readSnapshotReadOnly(projectPath)
    : await memoryStore.readSnapshot(projectPath)
  const manifest = await readSafeManifest(projectPath)
  if (manifest.projectId !== snapshot.projectId) {
    throw new CliInputError('The project manifest does not match project memory.')
  }
  const linkedSourceId = source === 'buzz' ? manifest.sources?.buzzChannelId : undefined
  if (source === 'buzz' && !linkedSourceId && dependencies.importPreview === undefined) {
    throw new CliInputError('Buzz must be linked before import.')
  }
  const verifyImportManifest = async () => {
    await project.verify()
    const current = await readSafeManifest(projectPath)
    if (
      current.projectId !== snapshot.projectId
      || (source === 'buzz' && current.sources?.buzzChannelId !== linkedSourceId)
    ) {
      throw new CliInputError('The project source linkage changed during import.')
    }
  }
  const rawPreview = await (dependencies.importPreview ?? loadImportPreview)({
    source,
    projectId: snapshot.projectId,
    sourceRoot,
    ...(linkedSourceId ? { linkedSourceId } : {}),
  })
  await sourceGuard.verify()
  await verifyImportManifest()
  const parsed = ImportPreviewSchema.safeParse(rawPreview)
  if (!parsed.success || parsed.data.projectId !== snapshot.projectId) {
    throw new CliInputError('Import preview is invalid for this project.')
  }
  const expectedWorkflow = source === 'wayfinder' ? 'story-wayfinder' : source
  if (parsed.data.source !== expectedWorkflow) {
    throw new CliInputError('Import preview source does not match the selected adapter.')
  }
  if (parsed.data.records.some(record => (
    record.projectId !== snapshot.projectId
    || record.source.workflow !== expectedWorkflow
  ))) {
    throw new CliInputError('Import record project id does not match the project package.')
  }
  if (source === 'wayfinder' && parsed.data.records.some(record => {
    if (record.kind !== 'canon' || record.requestedStatus !== 'active') return false
    const authority = record.source.authority
    return record.source.approval !== 'explicit'
      || authority === undefined
      || !('mode' in authority)
      || authority.mode !== 'hitl'
      || (authority.ticketType !== 'grill' && authority.ticketType !== 'sketch')
  })) {
    throw new CliInputError('Wayfinder active canon lacks eligible ticket authority.')
  }
  // Wayfinder ticket files are versioned sources: an amended ticket replaces
  // its earlier published version. Other adapters keep today's behaviour
  // (PitchStudio source ids are ordinal and not stable across edits).
  const records: PublishMemoryInput[] = parsed.data.records.map(record => (
    source === 'wayfinder' ? { ...record, supersedesPriorVersions: true } : record
  ))
  // A resolved Wayfinder ticket closes the open-question record of the same
  // ticket, but only when the open ticket file is really gone. ticketFiles
  // lists every file the adapter saw, imported or not; a preview without it
  // (older adapters, other workflows) closes nothing.
  const ticketFiles = new Set(parsed.data.ticketFiles ?? [])
  const openTicketPath = (record: PublishMemoryInput): string | undefined => {
    if (source !== 'wayfinder' || parsed.data.ticketFiles === undefined) return undefined
    if (record.kind !== 'canon' && record.kind !== 'development') return undefined
    if (!record.source.sourceId.startsWith('resolved/')) return undefined
    return `tickets/${record.source.sourceId.slice('resolved/'.length)}`
  }
  const openQuestionsFor = (
    current: Awaited<ReturnType<ProjectMemoryStore['readSnapshotReadOnly']>>,
    openPath: string,
  ) => current.records.filter(existing => (
    existing.status === 'active'
    && existing.kind === 'open_question'
    && existing.source.workflow === 'story-wayfinder'
    && existing.source.sourceId === openPath
  ))
  const landsCandidate = (record: PublishMemoryInput) => (
    record.requestedStatus === 'candidate' || record.safety === 'flagged'
  )
  const ambiguous: string[] = []
  const renamed: Array<{ from: string; to: string }> = []
  const noteRenamed = (from: string, to: string) => {
    if (!renamed.some(entry => entry.from === from && entry.to === to)) renamed.push({ from, to })
  }
  // Question ids to close for this record against the given snapshot.
  // Records the both-files-present case as ambiguous instead of closing.
  // With no basename match, the rename check looks for a removed ticket
  // whose question text equals this resolved ticket's question.
  const closureTargets = (
    current: Awaited<ReturnType<ProjectMemoryStore['readSnapshotReadOnly']>>,
    record: PublishMemoryInput,
  ): string[] => {
    const openPath = openTicketPath(record)
    if (openPath === undefined) return []
    const questions = openQuestionsFor(current, openPath)
    if (questions.length > 0) {
      if (ticketFiles.has(openPath)) {
        if (!ambiguous.includes(record.source.sourceId)) ambiguous.push(record.source.sourceId)
        return []
      }
      return questions.map(existing => existing.id)
    }
    const match = findRenamedQuestions(
      current.records,
      record.source.sourceId,
      parsed.data.ticketQuestions?.[record.source.sourceId],
      ticketFiles,
    )
    if (match === undefined) return []
    if ('ambiguousPaths' in match) {
      if (!ambiguous.includes(record.source.sourceId)) ambiguous.push(record.source.sourceId)
      return []
    }
    noteRenamed(match.openPath, record.source.sourceId)
    return match.records.map(existing => existing.id)
  }

  if (dryRun) {
    // Estimate only: the store resolves prior versions under its lock at
    // apply time. A version that is already published is a no-op and
    // retires nothing, so check idempotency before counting predecessors.
    let supersessionsExpected = 0
    let questionsClosedExpected = 0
    for (const record of records) {
      if (!record.supersedesPriorVersions) continue
      // Supersession applies only when the record lands active; a requested
      // candidate or a safety-flagged record never retires anything.
      if (landsCandidate(record)) continue
      const recordId = publicationRecordId(record.projectId, record.dedupeKey, record.source.sourceHash)
      if (snapshot.records.some(existing => existing.id === recordId)) continue
      const versions = priorVersionRecords(snapshot, {
        projectId: record.projectId,
        dedupeKey: record.dedupeKey,
        kind: record.kind,
        source: record.source,
      }).length
      const questions = closureTargets(snapshot, record).length
      supersessionsExpected += versions + questions
      questionsClosedExpected += questions
    }
    io.stdout(`${JSON.stringify({
      ...parsed.data,
      records,
      supersessionsExpected,
      questionsClosedExpected,
      ambiguous,
      renamed,
    }, null, 2)}\n`)
    return 0
  }

  let applied = 0
  let idempotent = 0
  let supersessions = 0
  let questionsClosed = 0
  let revision = snapshot.revision
  let latest = snapshot
  const MAX_REVISION_RETRIES = 3
  for (const record of records) {
    let result
    let questionIds = closureTargets(latest, record)
    let input: PublishMemoryInput = questionIds.length === 0
      ? record
      : {
        ...record,
        supersedes: [...new Set([...(record.supersedes ?? []), ...questionIds])],
        // Pin the closure to the snapshot its targets were chosen from; the
        // store refuses if another writer moved the ledger in between.
        expectedRevision: latest.revision,
      }
    for (let attempt = 1; ; attempt += 1) {
      try {
        await verifyImportManifest()
        result = await memoryStore.publish(projectPath, input)
        break
      } catch (error) {
        if (
          error instanceof ProjectMemoryStoreError
          && error.code === 'revision-conflict'
          && attempt < MAX_REVISION_RETRIES
        ) {
          await project.verify()
          latest = await memoryStore.readSnapshot(projectPath)
          questionIds = closureTargets(latest, record)
          input = questionIds.length === 0
            ? record
            : {
              ...record,
              supersedes: [...new Set([...(record.supersedes ?? []), ...questionIds])],
              expectedRevision: latest.revision,
            }
          continue
        }
        if (error instanceof ProjectMemoryStoreError && error.code === 'revision-conflict') throw error
        let reconciled
        try {
          await project.verify()
          reconciled = await memoryStore.reconcilePublication(projectPath, input)
        } catch {
          throw new CliImportPartialError({
            durability: 'unknown',
            lastKnownAppliedCount: applied,
            lastKnownRevision: revision,
          })
        }
        const durableApplied = (
          reconciled.publication !== undefined
          && reconciled.publication.eventRevision > revision
        ) ? 1 : 0
        throw new CliImportPartialError({
          durability: 'reconciled',
          appliedCount: applied + durableApplied,
          lastRevision: reconciled.snapshot.revision,
        })
      }
    }
    if (result.published) {
      applied += 1
      supersessions += result.record.supersedes.length
      questionsClosed += result.record.supersedes.filter(id => questionIds.includes(id)).length
    } else {
      idempotent += 1
    }
    latest = result.snapshot
    revision = latest.revision
  }
  const duplicates = parsed.data.duplicates + idempotent
  io.stdout(`${JSON.stringify({
    ...parsed.data,
    records,
    applied,
    supersessions,
    questionsClosed,
    ambiguous,
    renamed,
    duplicates,
    counts: { ...parsed.data.counts, duplicates },
    revision,
  }, null, 2)}\n`)
  return 0
}

interface AnswerRepair {
  kind: PublishMemoryInput['kind']
  workflow: PublishMemoryInput['source']['workflow']
  sourceId: string
  winnerRecordId: string
  winnerSourceHash: string
  /** Every active version of this source, the winner included. */
  retireRecordIds: string[]
  /** Active open-question records of the same ticket whose open file is gone. */
  closeQuestionIds: string[]
  /** Set when the questions were matched by question text after a rename. */
  renamedFrom?: string
  dedupeKey: string
}

interface SkippedRepair {
  kind: PublishMemoryInput['kind']
  workflow: PublishMemoryInput['source']['workflow']
  sourceId: string
  recordIds: string[]
  reason: string
}

interface SkippedQuestion {
  sourceId: string
  recordIds: string[]
  reason: string
}

type RepairSnapshot = Awaited<ReturnType<ProjectMemoryStore['readSnapshotReadOnly']>>

function versionAnchor(kind: string, workflow: string, sourceId: string): string {
  return `${kind}\0${workflow}\0${sourceId}`
}

function repairDedupeKey(workflow: string, sourceId: string, targetIds: readonly string[], closesQuestions: boolean): string {
  if (!closesQuestions) return `maintenance:collapse:${workflow}:${sourceId}`
  // A closure key must change with its targets: after a reopen, a later
  // closure against the same answer bytes is a new publication, while a
  // retry of the same closure stays idempotent.
  const digest = createHash('sha256').update([...targetIds].sort().join('\n')).digest('hex')
  return `maintenance:close:${workflow}:${sourceId}:${digest}`
}

/**
 * One-time repair for sources imported before versions superseded each other
 * and before answers closed their questions. Every active record sharing a
 * (kind, workflow, sourceId) anchor is a version of the same file; the winner
 * is the single version whose hash matches the file as it is now. For a
 * resolved Wayfinder ticket the same publication also closes the ticket's
 * open-question records when the open file is gone. Anything uncertain is
 * skipped and reported, never guessed.
 */
function planAnswerRepairs(
  snapshot: RepairSnapshot,
  currentVersions: readonly PublishMemoryInput[],
  ticketFiles: readonly string[] | undefined,
  ticketQuestions: Readonly<Record<string, string>> | undefined,
): { groups: AnswerRepair[]; skipped: SkippedRepair[]; skippedQuestions: SkippedQuestion[] } {
  const currentHashByAnchor = new Map<string, string>()
  const currentSourceIds = new Set<string>()
  for (const record of currentVersions) {
    currentHashByAnchor.set(
      versionAnchor(record.kind, record.source.workflow, record.source.sourceId),
      record.source.sourceHash,
    )
    currentSourceIds.add(record.source.sourceId)
  }
  const files = ticketFiles === undefined ? undefined : new Set(ticketFiles)
  const byAnchor = new Map<string, RepairSnapshot['records']>()
  const questionsByOpenPath = new Map<string, RepairSnapshot['records']>()
  for (const record of snapshot.records) {
    if (record.status !== 'active') continue
    const anchor = versionAnchor(record.kind, record.source.workflow, record.source.sourceId)
    byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), record])
    if (
      record.kind === 'open_question'
      && record.source.workflow === 'story-wayfinder'
      && record.source.sourceId.startsWith('tickets/')
    ) {
      const openPath = record.source.sourceId
      questionsByOpenPath.set(openPath, [...(questionsByOpenPath.get(openPath) ?? []), record])
    }
  }
  const groups: AnswerRepair[] = []
  const skipped: SkippedRepair[] = []
  const skippedQuestions: SkippedQuestion[] = []
  const claimedOpenPaths = new Set<string>()
  const sortedAnchors = [...byAnchor.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  for (const [anchor, members] of sortedAnchors) {
    const first = members[0]
    const base = {
      kind: first.kind,
      workflow: first.source.workflow,
      sourceId: first.source.sourceId,
      recordIds: members.map(record => record.id),
    }
    const isAnswerAnchor = first.source.workflow === 'story-wayfinder'
      && first.source.sourceId.startsWith('resolved/')
      && (first.kind === 'canon' || first.kind === 'development')
    const openPath = isAnswerAnchor ? `tickets/${first.source.sourceId.slice('resolved/'.length)}` : undefined
    let questions: RepairSnapshot['records'] = []
    let renamedFrom: string | undefined
    if (openPath !== undefined && files !== undefined) {
      const candidates = questionsByOpenPath.get(openPath) ?? []
      if (candidates.length > 0) {
        claimedOpenPaths.add(openPath)
        if (files.has(openPath)) {
          skippedQuestions.push({
            sourceId: openPath,
            recordIds: candidates.map(record => record.id),
            reason: 'The open ticket file still exists beside the resolved one.',
          })
        } else {
          questions = candidates
        }
      } else {
        const match = findRenamedQuestions(
          snapshot.records,
          first.source.sourceId,
          ticketQuestions?.[first.source.sourceId],
          files,
        )
        if (match !== undefined && 'ambiguousPaths' in match) {
          for (const ambiguousPath of match.ambiguousPaths) {
            claimedOpenPaths.add(ambiguousPath)
            skippedQuestions.push({
              sourceId: ambiguousPath,
              recordIds: (questionsByOpenPath.get(ambiguousPath) ?? []).map(record => record.id),
              reason: `More than one removed ticket has the same question text as ${first.source.sourceId}.`,
            })
          }
        } else if (match !== undefined) {
          claimedOpenPaths.add(match.openPath)
          questions = match.records
          renamedFrom = match.openPath
        }
      }
    }
    if (members.length < 2 && questions.length === 0) continue
    const questionSkip = (reason: string) => {
      if (questions.length > 0) {
        skippedQuestions.push({ sourceId: openPath as string, recordIds: questions.map(record => record.id), reason })
      }
    }
    const currentHash = currentHashByAnchor.get(anchor)
    if (currentHash === undefined) {
      if (members.length > 1) skipped.push({ ...base, reason: 'The source file is not in the current preview.' })
      questionSkip('The resolved file is not in the current preview.')
      continue
    }
    const matches = members.filter(record => record.source.sourceHash === currentHash)
    if (matches.length === 0) {
      if (members.length > 1) skipped.push({ ...base, reason: 'The current file version has not been published.' })
      questionSkip('The current resolved file version has not been published.')
      continue
    }
    if (matches.length > 1) {
      skipped.push({ ...base, reason: 'More than one active record matches the current file version.' })
      questionSkip('More than one active answer matches the current resolved file.')
      continue
    }
    const winner = matches[0]
    if (winner.source.authority !== undefined && 'verification' in winner.source.authority) {
      if (members.length > 1) skipped.push({ ...base, reason: 'The winner carries store-derived authority and cannot be republished.' })
      questionSkip('The answer carries store-derived authority and cannot be republished.')
      continue
    }
    const retireRecordIds = members.map(record => record.id)
    const closeQuestionIds = questions.map(record => record.id)
    groups.push({
      kind: winner.kind,
      workflow: winner.source.workflow,
      sourceId: winner.source.sourceId,
      winnerRecordId: winner.id,
      winnerSourceHash: winner.source.sourceHash,
      retireRecordIds,
      closeQuestionIds,
      ...(renamedFrom === undefined ? {} : { renamedFrom }),
      dedupeKey: repairDedupeKey(
        winner.source.workflow,
        winner.source.sourceId,
        [...retireRecordIds, ...closeQuestionIds],
        closeQuestionIds.length > 0,
      ),
    })
  }
  if (files !== undefined) {
    for (const [openPath, candidates] of [...questionsByOpenPath.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      if (claimedOpenPaths.has(openPath) || files.has(openPath)) continue
      const resolvedPath = `resolved/${openPath.slice('tickets/'.length)}`
      skippedQuestions.push({
        sourceId: openPath,
        recordIds: candidates.map(record => record.id),
        reason: currentSourceIds.has(resolvedPath)
          ? 'No active answer record exists for the resolved file.'
          : 'The ticket file is gone and no resolved file exists for it.',
      })
    }
  }
  // A question-version group whose every record is closed by an answer
  // repair is handled by that repair; do not also report it as skipped.
  const closedIds = new Set(groups.flatMap(group => group.closeQuestionIds))
  return {
    groups,
    skipped: skipped.filter(entry => !entry.recordIds.every(id => closedIds.has(id))),
    skippedQuestions,
  }
}

function maintenanceReplacementInput(
  snapshot: RepairSnapshot,
  group: AnswerRepair,
): PublishMemoryInput {
  const winner = snapshot.records.find(record => record.id === group.winnerRecordId)
  if (!winner) throw new CliInputError('The winning record disappeared before it could be republished.')
  return {
    projectId: winner.projectId,
    dedupeKey: group.dedupeKey,
    kind: winner.kind,
    requestedStatus: 'active',
    claim: winner.claim,
    ...(winner.detail === undefined ? {} : { detail: winner.detail }),
    tags: winner.tags,
    entities: winner.entities,
    source: winner.source,
    evidence: winner.evidence,
    safety: winner.safety,
    spoiler: winner.spoiler,
    supersedes: [...group.retireRecordIds, ...group.closeQuestionIds],
    supersedesPriorVersions: false,
    // The list Ben accepted was computed from this revision; refuse to apply
    // it over a ledger that moved since.
    expectedRevision: snapshot.revision,
  }
}

async function runReconcileStale(
  args: ParsedArguments,
  io: ProjectMemoryCliIo,
  dependencies: ProjectMemoryCliDependencies,
): Promise<number> {
  assertAllowedOptions(args, ['project', 'source', 'from'], ['dry-run', 'apply'])
  const dryRun = args.flags.has('dry-run')
  const apply = args.flags.has('apply')
  if (dryRun === apply) throw new CliInputError('Reconcile requires exactly one of --dry-run or --apply.')
  const project = await safeProjectPath(args)
  const projectPath = project.path
  const source = requiredValue(args, 'source')
  if (source !== 'wayfinder') throw new CliInputError('Only the wayfinder source supports reconcile-stale.')
  const sourceGuard = await guardExistingPath(requiredValue(args, 'from'), 'directory')
  const memoryStore = dependencies.memoryStore ?? projectMemoryStore
  await project.verify()
  const snapshot = dryRun
    ? await memoryStore.readSnapshotReadOnly(projectPath)
    : await memoryStore.readSnapshot(projectPath)
  const manifest = await readSafeManifest(projectPath)
  if (manifest.projectId !== snapshot.projectId) {
    throw new CliInputError('The project manifest does not match project memory.')
  }
  const verifyManifest = async () => {
    await project.verify()
    const current = await readSafeManifest(projectPath)
    if (current.projectId !== snapshot.projectId) {
      throw new CliInputError('The project identity changed during reconcile.')
    }
  }
  const rawPreview = await (dependencies.importPreview ?? loadImportPreview)({
    source,
    projectId: snapshot.projectId,
    sourceRoot: sourceGuard.path,
  })
  await sourceGuard.verify()
  await verifyManifest()
  const parsed = ImportPreviewSchema.safeParse(rawPreview)
  if (!parsed.success || parsed.data.projectId !== snapshot.projectId || parsed.data.source !== 'story-wayfinder') {
    throw new CliInputError('Import preview is invalid for this project.')
  }
  const plan = planAnswerRepairs(snapshot, parsed.data.records, parsed.data.ticketFiles, parsed.data.ticketQuestions)

  if (dryRun) {
    io.stdout(`${JSON.stringify({
      revision: snapshot.revision,
      groups: plan.groups,
      skipped: plan.skipped,
      skippedQuestions: plan.skippedQuestions,
    }, null, 2)}\n`)
    return 0
  }

  let applied = 0
  let idempotent = 0
  let questionsClosed = 0
  let revision = snapshot.revision
  let latest = snapshot
  for (const group of plan.groups) {
    const input = maintenanceReplacementInput(latest, group)
    let result
    try {
      await verifyManifest()
      result = await memoryStore.publish(projectPath, input)
    } catch (error) {
      // The accepted list no longer matches the ledger: stop here and ask
      // for a fresh dry-run rather than guessing.
      if (error instanceof ProjectMemoryStoreError && error.code === 'revision-conflict') throw error
      let reconciled
      try {
        await project.verify()
        reconciled = await memoryStore.reconcilePublication(projectPath, input)
      } catch {
        throw new CliImportPartialError({
          durability: 'unknown',
          lastKnownAppliedCount: applied,
          lastKnownRevision: revision,
        })
      }
      const durableApplied = (
        reconciled.publication !== undefined
        && reconciled.publication.eventRevision > revision
      ) ? 1 : 0
      throw new CliImportPartialError({
        durability: 'reconciled',
        appliedCount: applied + durableApplied,
        lastRevision: reconciled.snapshot.revision,
      })
    }
    if (result.published) {
      applied += 1
      questionsClosed += result.record.supersedes.filter(id => group.closeQuestionIds.includes(id)).length
    } else {
      idempotent += 1
    }
    revision = result.snapshot.revision
    latest = result.snapshot
  }
  const retired = new Set(plan.groups.flatMap(group => [...group.retireRecordIds, ...group.closeQuestionIds]))
  const staleConflicts = latest.conflicts
    .filter(conflict => (
      conflict.status === 'open'
      && retired.has(conflict.leftRecordId)
      && retired.has(conflict.rightRecordId)
    ))
    .map(conflict => conflict.id)
  io.stdout(`${JSON.stringify({
    revision,
    applied,
    idempotent,
    questionsClosed,
    groups: plan.groups,
    skipped: plan.skipped,
    skippedQuestions: plan.skippedQuestions,
    staleConflicts,
  }, null, 2)}\n`)
  return 0
}

function exitCodeFor(error: unknown): 1 | 2 | 3 {
  if (error instanceof CliImportPartialError) return 3
  if (error instanceof CliInputError || error instanceof UnsafeProjectMemoryPathError) return 2
  if (error instanceof ProjectMemoryStoreError) {
    return error.code === 'invalid-input' || error.code === 'invalid-action' ? 2 : 3
  }
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'ERR_PROJECT_MEMORY_IMPORT_INPUT') return 2
    if (['ENOENT', 'EACCES', 'EPERM', 'lock-timeout', 'lock-corrupt'].includes(String(error.code))) return 3
  }
  return 1
}

/**
 * `report` — produce a readable "What's Standing" report from project memory.
 *
 * Read-only: it opens the snapshot and writes nothing back. The run id is derived from the
 * snapshot rather than generated, so running the command twice on unchanged memory produces
 * the same artifact instead of two documents that differ only by identifier.
 */
async function runReport(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'profile', 'format'], [])
  const profile = args.values.get('profile') ?? 'whats-standing'
  if (profile !== 'whats-standing') throw new CliInputError('Unknown report profile.')
  const format = args.values.get('format') ?? 'markdown'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')

  const project = await safeProjectPath(args)
  await project.verify()
  // Read-only by contract: readSnapshot() can initialize a ledger, append
  // migration events, and rewrite projections, all of which would falsify this
  // command's promise that generating a report changes nothing. The consistent-pair
  // read (memory + annotations) and compose call live in readWhatsStandingReport,
  // shared with the What's Standing panel's server read path.
  const result = await readWhatsStandingReport(project.path)
  if (!result.ok) {
    io.stderr(`${result.reason}\n`)
    return 1
  }

  io.stdout(format === 'json'
    ? `${JSON.stringify(result.payload.composed, null, 2)}\n`
    : renderComposedMarkdown(result.payload.composed))
  return 0
}

/**
 * `invalidate` — sweep for annotation resolutions whose premise no longer holds and
 * durably reopen them. The recovery tool for a restored or hand-edited package; writer
 * paths run the same sweep automatically.
 */
async function runInvalidate(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project'], [])
  const project = await safeProjectPath(args)
  await project.verify()
  const invalidated = await annotationStore.invalidateStale(project.path)
  if (invalidated.length === 0) {
    io.stdout('Nothing to invalidate — all resolutions still hold.\n')
    return 0
  }
  for (const item of invalidated) {
    io.stdout(`Invalidated ${item.annotationId}: ${item.cause} (${item.changedRecordId})\n`)
  }
  return 0
}

/**
 * `questions` — list the reference questions the writer could answer right now.
 *
 * Read-only. Each question is a phrase in a record's own wording that appears to point at
 * another decision and has not been resolved, declined, or answered "can't say".
 */
async function runQuestions(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'format'], [])
  const format = args.values.get('format') ?? 'markdown'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')
  const project = await safeProjectPath(args)
  await project.verify()
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(project.path)
  const questions = await annotationStore.pendingQuestions(project.path, snapshot)

  if (format === 'json') {
    io.stdout(`${JSON.stringify({ projectId: snapshot.projectId, revision: snapshot.revision, questions }, null, 2)}\n`)
    return 0
  }
  if (questions.length === 0) {
    io.stdout('No open reference questions.\n')
    return 0
  }
  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const lines: string[] = [`${questions.length} open reference question(s):`, '']
  for (const q of questions) {
    lines.push(`## ${q.annotationId}`, '', q.questionText, '', 'Candidates:')
    if (q.candidateRecordIds.length === 0) {
      lines.push('  (none — answer with --cant-say or --decline)')
    }
    for (const id of q.candidateRecordIds) {
      const head = byId.get(id)?.claim.split('\n')[0] ?? ''
      lines.push(`  - ${id}  ${head.length > 70 ? `${head.slice(0, 69)}…` : head}`)
    }
    lines.push('', `Answer with: npm run memory -- answer --project <path> --question ${q.annotationId} --referents <id,id>  (or --cant-say / --decline)`, '')
  }
  io.stdout(`${lines.join('\n')}\n`)
  return 0
}

/**
 * `answer` — record the writer's answer to one reference question.
 *
 * A `new` question is proposed first, then answered, as two events — the proposal captures
 * the candidate list the answer is judged against. Free text is not accepted anywhere: the
 * only answers are referent ids from the candidate list, --cant-say, or --decline.
 */
async function runAnswer(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'question', 'referents'], ['cant-say', 'decline'])
  const annotationId = requiredValue(args, 'question')
  const cantSay = args.flags.has('cant-say')
  const decline = args.flags.has('decline')
  const referentsRaw = args.values.get('referents')
  const chosen = [cantSay, decline, referentsRaw !== undefined].filter(Boolean).length
  if (chosen !== 1) {
    throw new CliInputError('Answer with exactly one of --referents, --cant-say, or --decline.')
  }

  const project = await safeProjectPath(args)
  await project.verify()
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(project.path)
  const runId = `answer-r${snapshot.revision}`

  const pending = await annotationStore.pendingQuestions(project.path, snapshot)
  const question = pending.find(q => q.annotationId === annotationId)
  if (question === undefined) {
    throw new CliInputError('No such open question. Run the questions command to list them.')
  }
  if (question.status === 'new') {
    await annotationStore.propose(project.path, snapshot, annotationId, runId)
  }

  if (referentsRaw !== undefined) {
    const referents = referentsRaw.split(',').map(part => part.trim()).filter(part => part.length > 0)
    if (referents.length === 0) throw new CliInputError('--referents needs at least one record id.')
    const candidates = new Set(question.candidateRecordIds)
    for (const id of referents) {
      if (!candidates.has(id)) throw new CliInputError(`${id} is not among this question's candidates.`)
    }
    const state = await annotationStore.approve(project.path, snapshot, annotationId, referents, runId)
    io.stdout(`Resolved. “${state.locator.phrase}” now refers to: ${referents.join(', ')}\n`)
    return 0
  }

  const state = await annotationStore.decline(
    project.path, snapshot, annotationId, cantSay ? 'cant-say' : 'declined', runId)
  io.stdout(cantSay
    ? `Recorded as can't-say. “${state.locator.phrase}” stays unresolved and the report stays marked incomplete.\n`
    : `Declined. “${state.locator.phrase}” will not be asked again unless its wording changes.\n`)
  return 0
}

export async function runProjectMemoryCli(
  argv: string[],
  io: ProjectMemoryCliIo = processIo,
  dependencies: ProjectMemoryCliDependencies = {},
): Promise<number> {
  try {
    const args = parseArguments(argv)
    if (args.command === 'context') return await runContext(args, io)
    if (args.command === 'publish') return await runPublish(args, io, dependencies)
    if (args.command === 'export') return await runExport(args, io)
    if (args.command === 'link-source') return await runLinkSource(args, io, dependencies)
    if (args.command === 'import') return await runImport(args, io, dependencies)
    if (args.command === 'reconcile-stale') return await runReconcileStale(args, io, dependencies)
    if (args.command === 'report') return await runReport(args, io)
    if (args.command === 'invalidate') return await runInvalidate(args, io)
    if (args.command === 'questions') return await runQuestions(args, io)
    if (args.command === 'answer') return await runAnswer(args, io)
    throw new CliInputError('Unknown memory command.')
  } catch (error) {
    if (error instanceof AnnotationStoreError) {
      io.stderr(`${error.message}\n`)
      // Same contract as exitCodeFor: 2 for bad input, 3 for state that is unusable or
      // moved out from under the caller, 1 for anything else.
      if (error.reason === 'invalid-input' || error.reason === 'not-found') return 2
      if (error.reason === 'corrupt' || error.reason === 'conflict') return 3
      return 1
    }
    const exitCode = exitCodeFor(error)
    if (error instanceof CliImportPartialError) {
      if (error.progress.durability === 'reconciled') {
        io.stderr(`${JSON.stringify({
          error: 'import-partial',
          durability: 'reconciled',
          appliedCount: error.progress.appliedCount,
          lastRevision: error.progress.lastRevision,
          retry: 'Retry the same import with --apply; previously applied records are idempotent.',
        })}\n`)
      } else {
        io.stderr(`${JSON.stringify({
          error: 'import-partial',
          durability: 'unknown',
          lastKnownAppliedCount: error.progress.lastKnownAppliedCount,
          lastKnownRevision: error.progress.lastKnownRevision,
          currentRecordMayBeDurable: true,
          message: 'The ledger may contain the current import record; exact durability could not be verified.',
          retry: 'Retry the same import with --apply; deterministic dedupe key and source hash make the retry safe. Do not assume the current record was absent.',
        })}\n`)
      }
      return exitCode
    }
    io.stderr(exitCode === 2
      ? 'Invalid memory command input.\n'
      : exitCode === 3
        ? 'Project memory is unavailable.\n'
        : 'Project memory command failed.\n')
    return exitCode
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runProjectMemoryCli(process.argv.slice(2))
}
