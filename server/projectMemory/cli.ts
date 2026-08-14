import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants } from 'node:fs'
import { lstat, open, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { WriterOSProjectManifestSchema } from '../../client/src/lib/projectPackage'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { buildMemoryContext, citationLabelsForRecords } from './retrieval'
import { renderMemoryContextMarkdown } from './renderContext'
import { ProjectMemoryStoreError, projectMemoryStore } from './store'
import type { MemoryContextPackage } from '../../shared/projectMemory'
import { MemoryWorkflowSchema, PublishMemoryInputSchema, type PublishMemoryInput } from '../../shared/projectMemory'
import { z } from 'zod'

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
}

export interface ProjectMemoryCliDependencies {
  importPreview?(input: {
    source: 'wayfinder' | 'pitchstudio' | 'buzz'
    projectId: string
    sourceRoot: string
  }): Promise<ProjectMemoryImportPreview>
}

const processIo: ProjectMemoryCliIo = {
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value),
}

class CliInputError extends Error {}

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
  const projectPath = absoluteProjectPath(args)
  const format = args.values.get('format') ?? 'json'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')
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

async function readSafeJsonInput(inputPath: string): Promise<unknown> {
  const resolved = path.resolve(inputPath)
  const stats = await lstat(resolved)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1_000_000) {
    throw new CliInputError('The input must be a bounded regular file.')
  }
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== stats.dev || opened.ino !== stats.ino) {
      throw new CliInputError('The input file changed while opening it.')
    }
    try {
      return JSON.parse(await handle.readFile('utf8'))
    } catch (error) {
      if (error instanceof SyntaxError) throw new CliInputError('The input is not valid JSON.')
      throw error
    }
  } finally {
    await handle.close()
  }
}

async function runPublish(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'input'])
  const projectPath = absoluteProjectPath(args)
  const input = await readSafeJsonInput(requiredValue(args, 'input'))
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
  const projectPath = absoluteProjectPath(args)
  const format = args.values.get('format') ?? 'markdown'
  if (format !== 'json' && format !== 'markdown') throw new CliInputError('--format must be json or markdown.')
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

async function runLinkSource(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project', 'workflow', 'source-id'])
  const projectPath = absoluteProjectPath(args)
  if (requiredValue(args, 'workflow') !== 'buzz') {
    throw new CliInputError('Only the Buzz source linkage is supported.')
  }
  const sourceId = requiredValue(args, 'source-id')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceId)) {
    throw new CliInputError('The source id must be opaque and path-free.')
  }
  const projectStats = await lstat(projectPath)
  if (!projectStats.isDirectory() || projectStats.isSymbolicLink()) {
    throw new CliInputError('The project must be a real directory.')
  }
  const initial = await readSafeManifest(projectPath)
  const lock = await acquirePackageWriteLock({
    workspaceRoot: path.dirname(projectPath),
    projectId: initial.projectId,
  })
  let primaryError: unknown
  try {
    const locked = await readSafeManifest(projectPath)
    if (locked.projectId !== initial.projectId) {
      throw new CliInputError('project.json changed while acquiring its lock.')
    }
    const linked = locked.sources?.buzzChannelId !== sourceId
    if (linked) {
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
}).strict()

async function loadImportPreview(input: {
  source: 'wayfinder' | 'pitchstudio' | 'buzz'
  projectId: string
  sourceRoot: string
}): Promise<ProjectMemoryImportPreview> {
  try {
    const importerModuleUrl = new URL('./importer.ts', import.meta.url).href
    const module = await import(importerModuleUrl) as {
      previewProjectMemoryImport?: (value: typeof input) => Promise<ProjectMemoryImportPreview>
    }
    if (typeof module.previewProjectMemoryImport !== 'function') throw new Error('missing importer')
    return module.previewProjectMemoryImport(input)
  } catch {
    throw Object.assign(new Error('Project memory importer is unavailable.'), { code: 'ENOENT' })
  }
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
  const projectPath = absoluteProjectPath(args)
  const source = requiredValue(args, 'source')
  if (source !== 'wayfinder' && source !== 'pitchstudio' && source !== 'buzz') {
    throw new CliInputError('Unsupported import source.')
  }
  const sourceRoot = path.resolve(requiredValue(args, 'from'))
  const sourceStats = await lstat(sourceRoot)
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new CliInputError('Import source must be a real directory.')
  }
  const snapshot = await projectMemoryStore.readSnapshot(projectPath)
  const rawPreview = await (dependencies.importPreview ?? loadImportPreview)({
    source,
    projectId: snapshot.projectId,
    sourceRoot,
  })
  const parsed = ImportPreviewSchema.safeParse(rawPreview)
  if (!parsed.success || parsed.data.projectId !== snapshot.projectId) {
    throw new CliInputError('Import preview is invalid for this project.')
  }
  const expectedWorkflow = source === 'wayfinder' ? 'story-wayfinder' : source
  if (parsed.data.source !== expectedWorkflow) {
    throw new CliInputError('Import preview source does not match the selected adapter.')
  }
  if (parsed.data.records.some(record => record.projectId !== snapshot.projectId)) {
    throw new CliInputError('Import record project id does not match the project package.')
  }
  if (dryRun) {
    io.stdout(`${JSON.stringify(parsed.data, null, 2)}\n`)
    return 0
  }

  let applied = 0
  let idempotent = 0
  let revision = snapshot.revision
  for (const record of parsed.data.records) {
    const result = await projectMemoryStore.publish(projectPath, record)
    if (result.published) applied += 1
    else idempotent += 1
    revision = result.snapshot.revision
  }
  io.stdout(`${JSON.stringify({
    ...parsed.data,
    applied,
    duplicates: parsed.data.duplicates + idempotent,
    revision,
  }, null, 2)}\n`)
  return 0
}

function exitCodeFor(error: unknown): 1 | 2 | 3 {
  if (error instanceof CliInputError) return 2
  if (error instanceof ProjectMemoryStoreError) {
    return error.code === 'invalid-input' || error.code === 'invalid-action' ? 2 : 3
  }
  if (error && typeof error === 'object' && 'code' in error) {
    if (['ENOENT', 'EACCES', 'EPERM', 'lock-timeout', 'lock-corrupt'].includes(String(error.code))) return 3
  }
  return 1
}

export async function runProjectMemoryCli(
  argv: string[],
  io: ProjectMemoryCliIo = processIo,
  dependencies: ProjectMemoryCliDependencies = {},
): Promise<number> {
  try {
    const args = parseArguments(argv)
    if (args.command === 'context') return await runContext(args, io)
    if (args.command === 'publish') return await runPublish(args, io)
    if (args.command === 'export') return await runExport(args, io)
    if (args.command === 'link-source') return await runLinkSource(args, io)
    if (args.command === 'import') return await runImport(args, io, dependencies)
    throw new CliInputError('Unknown memory command.')
  } catch (error) {
    const exitCode = exitCodeFor(error)
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
