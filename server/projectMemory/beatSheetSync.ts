import { createHash, randomBytes } from 'node:crypto'
import { lstat, open, readdir as fsReaddir, readFile as fsReadFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  AuthoredDocumentStateSchema,
  OutlineDocumentContentSchema,
  type AuthoredDocumentState,
  type OutlineDocumentContent,
  type OutlineUnit,
} from '../../shared/documents'
import { isBeatSheetDeclared, parseBeatSheetDecision, type ParsedBeat } from '../../shared/beatSheet'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { readStoryDriveLinks } from '../projectLibrary/storyDriveLinks'
import { guardExistingPath, UnsafeProjectMemoryPathError, type SafeExistingPath } from './safePaths'

export type BeatSheetSyncStatus =
  | { kind: 'not-linked' }
  | { kind: 'no-beat-sheet' }
  | { kind: 'unchanged'; ticket: string; syncedAt: string; beatCount: number }
  | { kind: 'updated'; ticket: string; syncedAt: string; beatCount: number; added: string[]; removed: string[]; changed: string[] }
  | { kind: 'unavailable'; ticket: string | null; message: string }
  | { kind: 'malformed'; ticket: string; message: string }
  | { kind: 'reopened'; ticket: string; message: string }
  | { kind: 'ambiguous'; message: string }

export interface BeatSheetSyncOptions {
  workspaceRoot: string
  packagePath: string
  projectId: string
  timeoutMs?: number
  now?: () => Date
  write?: boolean
  readFile?: (p: string) => Promise<string>
  readdir?: (dir: string) => Promise<string[]>
}

export interface BeatSheetSyncResult {
  status: BeatSheetSyncStatus
  outline?: AuthoredDocumentState<OutlineDocumentContent>
}

const DEADLINE_MESSAGE = 'Story-drive did not answer in time.'
const HEADER_LINES = 64

class DeadlineError extends Error {
  constructor() {
    super(DEADLINE_MESSAGE)
    this.name = 'DeadlineError'
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

/** Fixed plain sentences only: never a raw error, never a filesystem path. */
function plainMessage(error: unknown): string {
  if (error instanceof DeadlineError) return DEADLINE_MESSAGE
  if (error instanceof UnsafeProjectMemoryPathError) return 'Story-drive path is not safe to read.'
  const code = errorCode(error)
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'Story-drive file not found.'
  if (code === 'lock-timeout') return 'The project was busy; try again.'
  if (code === 'EACCES' || code === 'EPERM') return 'Story-drive folder is not readable.'
  return 'Story-drive could not be read.'
}

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function withDeadline<T>(deadline: number, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      promise.catch(() => undefined)
      reject(new DeadlineError())
      return
    }
    const timer = setTimeout(() => reject(new DeadlineError()), remaining)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

/** Same layout rule as the Wayfinder adapter: `<root>/wayfinder` when present, else the root. */
async function ticketRoot(sourceRoot: string): Promise<string> {
  const candidate = path.join(sourceRoot, 'wayfinder')
  try {
    const stats = await lstat(candidate)
    if (stats.isSymbolicLink()) {
      throw new UnsafeProjectMemoryPathError('The source contains a symbolic link.')
    }
    if (stats.isDirectory()) return candidate
  } catch (error) {
    if (!isEnoent(error)) throw error
  }
  return sourceRoot
}

/** lstat a Story-drive entry: false when it does not exist, throws when it is a symlink. */
async function refuseSymlink(target: string): Promise<boolean> {
  try {
    const stats = await lstat(target)
    if (stats.isSymbolicLink()) {
      throw new UnsafeProjectMemoryPathError('The Story-drive folder contains a symbolic link.')
    }
    return true
  } catch (error) {
    if (isEnoent(error)) return false
    throw error
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

type Located =
  | { kind: 'found'; ticket: string }
  | { kind: 'no-beat-sheet' }
  | { kind: 'ambiguous'; message: string }
  | { kind: 'reopened'; ticket: string; message: string }

async function locateDecision(
  ticketDir: string,
  pointer: string | undefined,
  read: (p: string) => Promise<string>,
  list: () => Promise<string[]>,
  exists: (p: string) => Promise<boolean>,
  refuseSymlink: (p: string) => Promise<boolean>,
  previousTicket?: string,
): Promise<Located> {
  if (pointer) {
    await refuseSymlink(path.join(ticketDir, 'resolved'))
    if (await exists(path.join(ticketDir, pointer))) return { kind: 'found', ticket: pointer }
    const moved = `tickets/${path.basename(pointer)}`
    await refuseSymlink(path.join(ticketDir, 'tickets'))
    if (await exists(path.join(ticketDir, moved))) {
      return {
        kind: 'reopened',
        ticket: pointer,
        message: 'The beat-sheet decision was reopened in Story-drive; the beats here are left as they were.',
      }
    }
    return { kind: 'found', ticket: pointer } // the read below reports the missing file as unavailable
  }

  // Nothing declared any more: if what we last synced now sits in tickets/, it was reopened.
  const nothingDeclared = async (): Promise<Located> => {
    if (previousTicket) {
      await refuseSymlink(path.join(ticketDir, 'tickets'))
      if (await exists(path.join(ticketDir, `tickets/${path.basename(previousTicket)}`))) {
        return {
          kind: 'reopened',
          ticket: previousTicket,
          message: 'The beat-sheet decision was reopened in Story-drive; the beats here are left as they were.',
        }
      }
    }
    return { kind: 'no-beat-sheet' }
  }

  let names: string[]
  try {
    if (!await refuseSymlink(path.join(ticketDir, 'resolved'))) return await nothingDeclared()
    names = await list()
  } catch (error) {
    if (isEnoent(error)) return await nothingDeclared()
    throw error
  }
  const declared: string[] = []
  for (const name of names.filter(entry => entry.endsWith('.md')).sort()) {
    await refuseSymlink(path.join(ticketDir, 'resolved', name))
    const head = (await read(path.join(ticketDir, 'resolved', name))).split('\n').slice(0, HEADER_LINES).join('\n')
    if (isBeatSheetDeclared(head)) declared.push(`resolved/${name}`)
  }
  if (declared.length === 0) return nothingDeclared()
  if (declared.length > 1) {
    return { kind: 'ambiguous', message: `More than one resolved decision declares a beat sheet: ${declared.join(', ')}.` }
  }
  return { kind: 'found', ticket: declared[0] }
}

const CARRIED_FIELDS = [
  'location', 'characters', 'conflict', 'turn', 'consequence', 'whyNext',
  'linkedSceneIds', 'draftNotes', 'aiProduction',
] as const

export function planBeatUnits(
  existing: OutlineDocumentContent,
  beats: ParsedBeat[],
): { units: OutlineUnit[]; added: string[]; removed: string[]; changed: string[] } {
  const previous = new Map(existing.units.map(unit => [unit.id, unit]))
  const added: string[] = []
  const changed: string[] = []
  const units = beats.map((beat): OutlineUnit => {
    const unit: OutlineUnit = {
      id: beat.key,
      number: beat.number,
      actOrSequence: beat.movement,
      title: beat.title,
      whatHappens: beat.body,
      location: '',
      characters: [],
      conflict: '',
      turn: '',
      consequence: '',
      whyNext: '',
      linkedSceneIds: [],
      draftNotes: '',
    }
    const old = previous.get(beat.key)
    if (!old) {
      added.push(beat.key)
      return unit
    }
    for (const field of CARRIED_FIELDS) {
      if (old[field] !== undefined) (unit as Record<string, unknown>)[field] = old[field]
    }
    if (
      old.number !== unit.number || old.actOrSequence !== unit.actOrSequence
      || old.title !== unit.title || old.whatHappens !== unit.whatHappens
    ) changed.push(beat.key)
    return unit
  })
  const kept = new Set(units.map(unit => unit.id))
  const removed = existing.units.filter(unit => !kept.has(unit.id)).map(unit => unit.id)
  return { units, added, removed, changed }
}

export async function syncBeatSheet(options: BeatSheetSyncOptions): Promise<BeatSheetSyncResult> {
  const read = options.readFile ?? ((p: string) => fsReadFile(p, 'utf8'))
  const list = options.readdir ?? ((dir: string) => fsReaddir(dir))
  const registry = await readStoryDriveLinks(options.workspaceRoot)
  const link = registry.links[options.projectId]
  if (!link) return { status: { kind: 'not-linked' } }

  const lock = await acquirePackageWriteLock({ workspaceRoot: options.workspaceRoot, projectId: options.projectId })
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 1500)
    const timed = <T>(op: () => Promise<T>): Promise<T> => withDeadline(deadline, op())
    const unavailable = (error: unknown): BeatSheetSyncResult =>
      ({ status: { kind: 'unavailable', ticket: link.beatSheet ?? null, message: plainMessage(error) } })

    let root: SafeExistingPath
    try {
      root = await timed(() => guardExistingPath(link.root, 'directory'))
      await timed(() => root.verify())
    } catch (error) {
      return unavailable(error)
    }

    const outlinePath = path.join(options.packagePath, 'documents/outline.json')
    const outlineDoc = AuthoredDocumentStateSchema(OutlineDocumentContentSchema)
      .parse(JSON.parse(await fsReadFile(outlinePath, 'utf8')))
    const content = outlineDoc.content

    let located: Located
    let bytes: string
    try {
      const ticketDir = await timed(() => ticketRoot(root.canonicalPath))
      located = await locateDecision(
        ticketDir,
        link.beatSheet,
        p => timed(() => read(p)),
        () => timed(() => list(path.join(ticketDir, 'resolved'))),
        p => timed(() => refuseSymlink(p)),
        p => timed(() => refuseSymlink(p)),
        content.beatSheetSource?.ticket,
      )
      if (located.kind === 'no-beat-sheet') return { status: { kind: 'no-beat-sheet' } }
      if (located.kind === 'ambiguous') return { status: located }
      if (located.kind === 'reopened') return { status: located }
      const ticket = located.ticket
      bytes = await timed(() => read(path.join(ticketDir, ticket)))
    } catch (error) {
      return unavailable(error)
    }

    const sourceHash = createHash('sha256').update(bytes).digest('hex')
    if (content.beatSheetSource?.sourceHash === sourceHash) {
      return {
        status: {
          kind: 'unchanged',
          ticket: located.ticket,
          syncedAt: content.beatSheetSource.syncedAt,
          beatCount: content.beatSheetSource.beatCount,
        },
      }
    }

    const parsed = parseBeatSheetDecision(bytes)
    if (!parsed.ok) return { status: { kind: 'malformed', ticket: located.ticket, message: parsed.message } }

    const plan = planBeatUnits(content, parsed.beats)
    const syncedAt = (options.now?.() ?? new Date()).toISOString()
    const status: BeatSheetSyncStatus = {
      kind: 'updated',
      ticket: located.ticket,
      syncedAt,
      beatCount: plan.units.length,
      added: plan.added,
      removed: plan.removed,
      changed: plan.changed,
    }
    if (options.write === false) return { status }

    const next: AuthoredDocumentState<OutlineDocumentContent> = {
      ...outlineDoc,
      revision: outlineDoc.revision + 1,
      updatedAt: syncedAt,
      content: {
        ...content,
        units: plan.units,
        beatSheetSource: {
          ticket: located.ticket,
          sourceHash,
          syncedAt,
          beatCount: plan.units.length,
          label: parsed.label,
        },
      },
    }
    await atomicReplace(outlinePath, `${JSON.stringify(next, null, 2)}\n`)
    return { status, outline: next }
  } finally {
    await lock.release()
  }
}
