import { lstat, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { atomicReplace } from '../projectMemory/store'
import { appealFileName, renderAppealTicket, type AppealDraft } from './appealTicket'

// Canon appeals outbox: appeals are queued inside the memory commit (so they
// are never lost) and delivered to the linked Story-drive folder afterwards,
// with a time limit, so an unreachable folder can never hold WriterOS up.

export const APPEALS_OUTBOX_FILE = 'appeals-outbox.json'
const DEFAULT_TIMEOUT_MS = 5000

export interface OutboxEntry {
  recordId: string
  lineageIds: string[]
  fileName: string
  ticket: string
  status: 'pending' | 'delivered' | 'failed'
  error?: string
  updatedAt: string
}
export interface AppealsOutbox { version: 1; entries: OutboxEntry[] }

export interface DeliverOptions {
  timeoutMs?: number
  now?: () => string
  /** Tests only: replaces the real write of a ticket file. */
  writeFile?: (filePath: string, contents: string) => Promise<void>
  /**
   * Runs the final outbox re-read, merge and write under the caller's project
   * lock (the one enqueueAppeals runs under). Never wraps the ticket writes.
   */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>
}

const outboxPath = (projectPath: string) => path.join(projectPath, 'memory', APPEALS_OUTBOX_FILE)
const emptyOutbox = (): AppealsOutbox => ({ version: 1, entries: [] })
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const exists = (target: string) => stat(target).then(() => true, () => false)

export async function readOutbox(projectPath: string): Promise<AppealsOutbox> {
  let raw: string
  try {
    raw = await readFile(outboxPath(projectPath), 'utf8')
  } catch {
    return emptyOutbox()
  }
  try {
    const parsed = JSON.parse(raw) as AppealsOutbox
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) return parsed
  } catch {
    // fall through
  }
  console.error(`Appeals outbox at ${outboxPath(projectPath)} is unreadable; starting empty.`)
  return emptyOutbox()
}

async function writeOutbox(projectPath: string, outbox: AppealsOutbox): Promise<void> {
  await atomicReplace(outboxPath(projectPath), `${JSON.stringify(outbox, null, 2)}\n`)
}

// Call only under the project lock.
export async function enqueueAppeals(projectPath: string, appeals: AppealDraft[], now: string): Promise<void> {
  if (appeals.length === 0) return
  const outbox = await readOutbox(projectPath)
  for (const appeal of appeals) {
    const lineage = new Set([appeal.recordId, ...appeal.lineageIds])
    const index = outbox.entries.findIndex(entry => lineage.has(entry.recordId))
    const entry: OutboxEntry = {
      recordId: appeal.recordId,
      lineageIds: appeal.lineageIds,
      fileName: index >= 0 ? outbox.entries[index].fileName : appealFileName(appeal.recordId),
      ticket: renderAppealTicket(appeal),
      status: 'pending',
      updatedAt: now,
    }
    if (index >= 0) outbox.entries[index] = entry
    else outbox.entries.push(entry)
  }
  await writeOutbox(projectPath, outbox)
}

async function defaultWriteFile(filePath: string, contents: string): Promise<void> {
  await atomicReplace(filePath, contents)
}

// Every reason below reaches Ben (outbox, Memory line, backfill CLI), so each is
// a plain sentence; the raw error goes to the log.
export const NOT_LINKED_MESSAGE = "This project isn't linked to a Story-drive folder."
export const LINKS_UNREADABLE_MESSAGE = "WriterOS couldn't read its list of linked Story-drive folders; it will retry."
export const TIMEOUT_MESSAGE = 'Delivery to the Story-drive folder timed out; it will retry.'
export const NO_PERMISSION_MESSAGE = "macOS hasn't given WriterOS permission to open the Story-drive folder."
export const FOLDER_MISSING_MESSAGE = "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline."
export const NOT_A_FOLDER_MESSAGE = "The linked Story-drive path isn't a folder."
export const NOT_WAYFINDER_MESSAGE = "The linked folder doesn't look like a Story-drive wayfinder folder."
export const WRITE_FAILED_MESSAGE = "WriterOS couldn't write to the Story-drive folder."

/** Passed instead of a folder when the Story-drive links registry could not be read. */
export const LINKS_UNREADABLE: unique symbol = Symbol('story-drive-links-unreadable')
/** The linked wayfinder folder, null when the project has no link, or LINKS_UNREADABLE. */
export type AppealDestination = string | null | typeof LINKS_UNREADABLE

export function plainDeliveryReason(error: unknown): string {
  console.error(`Canon appeal delivery error: ${reasonOf(error)}`)
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined
  if (code === 'EPERM' || code === 'EACCES') return NO_PERMISSION_MESSAGE
  if (code === 'ENOENT') return FOLDER_MISSING_MESSAGE
  if (code === 'ENOTDIR' || /not a directory/i.test(reasonOf(error))) return NOT_A_FOLDER_MESSAGE
  return WRITE_FAILED_MESSAGE
}

// A problem with the folder itself: every remaining entry fails the same way.
class RootProblem extends Error {}

async function lstatIfPresent(target: string) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function checkRoot(wayfinderRoot: string): Promise<void> {
  try {
    const info = await lstat(wayfinderRoot)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new RootProblem(NOT_A_FOLDER_MESSAGE)
    const tickets = path.join(wayfinderRoot, 'tickets')
    const [ticketsInfo, resolvedInfo] = await Promise.all([
      lstatIfPresent(tickets),
      lstatIfPresent(path.join(wayfinderRoot, 'resolved')),
    ])
    // Never create tickets/ somewhere that isn't a wayfinder folder.
    if (!ticketsInfo && !resolvedInfo) throw new RootProblem(NOT_WAYFINDER_MESSAGE)
    if (!ticketsInfo) await mkdir(tickets)
    else if (ticketsInfo.isSymbolicLink() || !ticketsInfo.isDirectory()) throw new RootProblem(NOT_A_FOLDER_MESSAGE)
  } catch (error) {
    if (error instanceof RootProblem) throw error
    throw new RootProblem(plainDeliveryReason(error))
  }
}

// An earlier appeal that was already closed stays closed; this one gets a name
// no closed appeal uses.
async function openFileName(wayfinderRoot: string, entry: OutboxEntry): Promise<string> {
  const closed = (name: string) => exists(path.join(wayfinderRoot, 'resolved', name))
  if (!(await closed(entry.fileName))) return entry.fileName
  const base = appealFileName(entry.recordId).replace(/\.md$/, '')
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${base}.md` : `${base}-${n}.md`
    if (!(await closed(name))) return name
  }
}

const TIMED_OUT = Symbol('timed-out')
async function withinLimit<T>(timeoutMs: number, work: () => Promise<T>): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
  })
  try {
    return await Promise.race([work(), timedOut])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Deliveries for one package run one at a time, in this process.
const deliveryChains = new Map<string, Promise<unknown>>()

// Never throws.
export function deliverPendingAppeals(
  projectPath: string,
  wayfinderRoot: AppealDestination,
  options: DeliverOptions = {},
): Promise<AppealsOutbox> {
  const key = path.resolve(projectPath)
  const run = (deliveryChains.get(key) ?? Promise.resolve()).then(() => deliverNow(projectPath, wayfinderRoot, options))
  const tail = run.finally(() => {
    if (deliveryChains.get(key) === tail) deliveryChains.delete(key)
  })
  deliveryChains.set(key, tail)
  return run
}

async function deliverNow(
  projectPath: string,
  wayfinderRoot: AppealDestination,
  options: DeliverOptions = {},
): Promise<AppealsOutbox> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? (() => new Date().toISOString())
  const write = options.writeFile ?? defaultWriteFile
  let outbox: AppealsOutbox = emptyOutbox()
  try {
    outbox = await readOutbox(projectPath)
    const todo = outbox.entries.filter(entry => entry.status !== 'delivered')
    if (todo.length === 0) return outbox
    const readAs = new Map(todo.map(entry => [entry.recordId, { ticket: entry.ticket, updatedAt: entry.updatedAt }]))

    const fail = (entry: OutboxEntry, error: string) => {
      entry.status = 'failed'
      entry.error = error
      entry.updatedAt = now()
    }
    if (wayfinderRoot === null) {
      for (const entry of todo) fail(entry, NOT_LINKED_MESSAGE)
    } else if (wayfinderRoot === LINKS_UNREADABLE) {
      for (const entry of todo) fail(entry, LINKS_UNREADABLE_MESSAGE)
    } else {
      const root = wayfinderRoot
      for (let index = 0; index < todo.length; index += 1) {
        const entry = todo[index]
        const failRest = (reason: string) => { for (const rest of todo.slice(index)) fail(rest, reason) }
        try {
          // The whole step, folder checks included, runs under the time limit so a
          // stalled iCloud call can't hold up this package's deliveries.
          const fileName = await withinLimit(timeoutMs, async () => {
            await checkRoot(root)
            const name = await openFileName(root, entry)
            await write(path.join(root, 'tickets', name), entry.ticket)
            return name
          })
          if (fileName === TIMED_OUT) {
            // A stalled folder stalls every later entry too; don't wait on each one.
            failRest(TIMEOUT_MESSAGE)
            break
          }
          entry.fileName = fileName
          entry.status = 'delivered'
          delete entry.error
          entry.updatedAt = now()
        } catch (error) {
          if (error instanceof RootProblem) {
            failRest(error.message)
            break
          }
          fail(entry, plainDeliveryReason(error))
        }
      }
    }
    // A commit may have enqueued while we were writing. Merge only what this call
    // handled into a fresh copy, and leave re-enqueued entries pending.
    const withLock = options.withLock ?? (<T>(fn: () => Promise<T>) => fn())
    outbox = await withLock(async () => {
      const fresh = await readOutbox(projectPath)
      for (const handled of todo) {
        const current = fresh.entries.find(entry => entry.recordId === handled.recordId)
        const before = readAs.get(handled.recordId)
        if (!current || !before || current.ticket !== before.ticket || current.updatedAt !== before.updatedAt) continue
        current.status = handled.status
        current.fileName = handled.fileName
        current.updatedAt = handled.updatedAt
        if (handled.error === undefined) delete current.error
        else current.error = handled.error
      }
      await writeOutbox(projectPath, fresh)
      return fresh
    })
  } catch (error) {
    console.error(`Could not save the appeals outbox: ${reasonOf(error)}`)
  }
  return outbox
}
