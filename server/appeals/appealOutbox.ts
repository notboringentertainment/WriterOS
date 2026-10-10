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

async function checkRoot(wayfinderRoot: string): Promise<string | null> {
  try {
    const info = await lstat(wayfinderRoot)
    if (info.isSymbolicLink()) return 'the folder is a shortcut, not a real folder'
    if (!info.isDirectory()) return 'it is not a folder'
    const tickets = path.join(wayfinderRoot, 'tickets')
    await mkdir(tickets, { recursive: true })
    const ticketsInfo = await lstat(tickets)
    if (ticketsInfo.isSymbolicLink() || !ticketsInfo.isDirectory()) return 'its tickets folder is not a real folder'
    return null
  } catch (error) {
    return reasonOf(error)
  }
}

// Deliveries for one package run one at a time, in this process.
const deliveryChains = new Map<string, Promise<unknown>>()

// Never throws.
export function deliverPendingAppeals(
  projectPath: string,
  wayfinderRoot: string | null,
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
  wayfinderRoot: string | null,
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
    const rootProblem = wayfinderRoot === null ? null : await checkRoot(wayfinderRoot)
    if (wayfinderRoot === null) {
      for (const entry of todo) fail(entry, "This project isn't linked to a Story-drive folder.")
    } else if (rootProblem) {
      for (const entry of todo) fail(entry, `WriterOS can't reach the Story-drive folder: ${rootProblem}`)
    } else {
      for (const entry of todo) {
        let timer: NodeJS.Timeout | undefined
        try {
          // An earlier appeal that was already closed stays closed; this one gets its own file.
          if (await exists(path.join(wayfinderRoot, 'resolved', entry.fileName))) {
            entry.fileName = appealFileName(entry.recordId)
          }
          const target = path.join(wayfinderRoot, 'tickets', entry.fileName)
          const timedOut = new Promise<'timeout'>(resolve => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs)
          })
          const result = await Promise.race([write(target, entry.ticket).then(() => 'ok' as const), timedOut])
          if (result === 'timeout') {
            fail(entry, 'Delivery to the Story-drive folder timed out; it will retry.')
          } else {
            entry.status = 'delivered'
            delete entry.error
            entry.updatedAt = now()
          }
        } catch (error) {
          fail(entry, `WriterOS can't reach the Story-drive folder: ${reasonOf(error)}`)
        } finally {
          if (timer) clearTimeout(timer)
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
