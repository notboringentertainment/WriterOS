import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 5_000
const STALE_LOCK_AGE_MS = 15 * 60 * 1_000
const MIN_RETRY_DELAY_MS = 25
const MAX_RETRY_DELAY_MS = 250
const LOCK_FRAME_PREFIX = 'WOSLOCK1 '
const LOCK_FRAME_SUFFIX = ' END'

interface PackageLockClaim {
  kind: 'claim'
  token: string
  hostname: string
  pid: number
  createdAt: string
}

interface PackageLockResolution {
  kind: 'release' | 'recover'
  token: string
  createdAt: string
}

type PackageLockRecord = PackageLockClaim | PackageLockResolution

export interface PackageWriteLock {
  release(): Promise<void>
}

export interface PackageWriteLockTestHooks {
  beforeRelease?(): Promise<void>
  beforeJournalOpen?(lockPath: string): Promise<void>
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
}

function packageLockPath(workspaceRoot: string, projectId: string): string {
  const projectHash = createHash('sha256').update(projectId).digest('hex')
  return path.join(workspaceRoot, `.writeros-project-${projectHash}.lock`)
}

function parseLockRecord(raw: string): PackageLockRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<PackageLockRecord>
    if (
      typeof value.token !== 'string'
      || typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))
    ) {
      return null
    }
    if (value.kind === 'release' || value.kind === 'recover') {
      return value as PackageLockResolution
    }
    if (
      (value.kind === undefined || value.kind === 'claim')
      && typeof (value as Partial<PackageLockClaim>).hostname === 'string'
      && Number.isSafeInteger((value as Partial<PackageLockClaim>).pid)
      && ((value as Partial<PackageLockClaim>).pid ?? 0) > 0
    ) {
      return {
        kind: 'claim',
        token: value.token,
        hostname: (value as Partial<PackageLockClaim>).hostname!,
        pid: (value as Partial<PackageLockClaim>).pid!,
        createdAt: value.createdAt,
      }
    }
    return null
  } catch {
    return null
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !isNodeError(error, 'ESRCH')
  }
}

function claimCanBeRecovered(claim: PackageLockClaim): boolean {
  const expired = Date.now() - Date.parse(claim.createdAt) > STALE_LOCK_AGE_MS
  const abandonedBySameHost = claim.hostname === hostname() && !processExists(claim.pid)
  return expired || abandonedBySameHost
}

function timeoutError(): Error & { code: string } {
  return Object.assign(
    new Error('Timed out waiting for the WriterOS project package lock.'),
    { code: 'lock-timeout' },
  )
}

function corruptLockError(): Error & { code: string } {
  return Object.assign(
    new Error('WriterOS project package lock journal is malformed.'),
    { code: 'lock-corrupt' },
  )
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

async function ensureLockJournal(lockPath: string): Promise<void> {
  try {
    const handle = await open(lockPath, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if (!isNodeError(error, 'EEXIST')) throw error
  }

  const stats = await lstat(lockPath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw corruptLockError()
}

async function openLockJournal(
  lockPath: string,
  flags: number,
  testHooks?: PackageWriteLockTestHooks,
): Promise<FileHandle> {
  const before = await lstat(lockPath)
  if (!before.isFile() || before.isSymbolicLink()) throw corruptLockError()
  await testHooks?.beforeJournalOpen?.(lockPath)

  let handle: FileHandle
  try {
    handle = await open(lockPath, flags | constants.O_NOFOLLOW)
  } catch (error) {
    if (isNodeError(error, 'ELOOP') || isNodeError(error, 'EMLINK')) throw corruptLockError()
    throw error
  }

  try {
    const opened = await handle.stat()
    const current = await lstat(lockPath)
    if (
      !opened.isFile()
      || current.isSymbolicLink()
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || current.dev !== opened.dev
      || current.ino !== opened.ino
    ) {
      throw corruptLockError()
    }
    return handle
  } catch (error) {
    await handle.close()
    throw error
  }
}

function frameLockRecord(record: PackageLockRecord): Buffer {
  const encoded = Buffer.from(JSON.stringify(record), 'utf8').toString('base64url')
  return Buffer.from(`\n${LOCK_FRAME_PREFIX}${encoded}${LOCK_FRAME_SUFFIX}\n`, 'utf8')
}

function parseFramedLockRecord(line: string): PackageLockRecord | null {
  if (!line.startsWith(LOCK_FRAME_PREFIX) || !line.endsWith(LOCK_FRAME_SUFFIX)) return null
  const encoded = line.slice(LOCK_FRAME_PREFIX.length, -LOCK_FRAME_SUFFIX.length)
  const decoded = Buffer.from(encoded, 'base64url')
  if (decoded.toString('base64url') !== encoded) return null
  return parseLockRecord(decoded.toString('utf8'))
}

async function appendLockRecord(
  lockPath: string,
  record: PackageLockRecord,
  testHooks?: PackageWriteLockTestHooks,
): Promise<void> {
  const handle = await openLockJournal(
    lockPath,
    constants.O_WRONLY | constants.O_APPEND,
    testHooks,
  )
  try {
    const frame = frameLockRecord(record)
    const { bytesWritten } = await handle.write(frame, 0, frame.length)
    if (bytesWritten !== frame.length) {
      throw Object.assign(new Error('WriterOS project package lock record was only partially written.'), {
        code: 'lock-write-incomplete',
      })
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function parseJournalRecords(raw: string): PackageLockRecord[] {
  const records: PackageLockRecord[] = []
  const lines = raw.split('\n')
  const isCrashTailBeforeFrame = (lineIndex: number) => {
    const nextLine = lines[lineIndex + 1]
    return typeof nextLine === 'string' && parseFramedLockRecord(nextLine) !== null
  }

  for (const [lineIndex, line] of lines.entries()) {
    if (!line) continue
    if (line.startsWith(LOCK_FRAME_PREFIX)) {
      // A write can crash anywhere before its suffix. The next append begins
      // with a newline, isolating those bytes from the next complete frame.
      if (!line.endsWith(LOCK_FRAME_SUFFIX)) {
        if (isCrashTailBeforeFrame(lineIndex)) continue
        throw corruptLockError()
      }
      const framed = parseFramedLockRecord(line)
      if (!framed) throw corruptLockError()
      records.push(framed)
      continue
    }

    const legacy = parseLockRecord(line)
    if (legacy) {
      records.push(legacy)
      continue
    }

    if (isCrashTailBeforeFrame(lineIndex)) continue
    throw corruptLockError()
  }
  return records
}

async function readActiveClaims(
  lockPath: string,
  testHooks?: PackageWriteLockTestHooks,
): Promise<PackageLockClaim[]> {
  const handle = await openLockJournal(lockPath, constants.O_RDONLY, testHooks)
  try {
    const raw = await handle.readFile('utf8')
    if (raw.length === 0) return []

    const active = new Map<string, PackageLockClaim>()
    for (const record of parseJournalRecords(raw)) {
      if (record.kind === 'claim') {
        if (!active.has(record.token)) active.set(record.token, record)
      } else {
        active.delete(record.token)
      }
    }
    return [...active.values()]
  } finally {
    await handle.close()
  }
}

export async function acquirePackageWriteLock(input: {
  workspaceRoot: string
  projectId: string
  timeoutMs?: number
  /** @internal Deterministic filesystem race injection for regression tests. */
  testHooks?: PackageWriteLockTestHooks
}): Promise<PackageWriteLock> {
  const lockPath = packageLockPath(input.workspaceRoot, input.projectId)
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + Math.max(0, timeoutMs)
  let retryDelayMs = MIN_RETRY_DELAY_MS
  const claim: PackageLockClaim = {
    kind: 'claim',
    token: randomBytes(16).toString('hex'),
    hostname: hostname(),
    pid: process.pid,
    createdAt: new Date().toISOString(),
  }

  await ensureLockJournal(lockPath)
  await appendLockRecord(lockPath, claim, input.testHooks)

  while (true) {
    const activeClaims = await readActiveClaims(lockPath, input.testHooks)
    for (const activeClaim of activeClaims) {
      if (activeClaim.token !== claim.token && claimCanBeRecovered(activeClaim)) {
        await appendLockRecord(lockPath, {
          kind: 'recover',
          token: activeClaim.token,
          createdAt: new Date().toISOString(),
        }, input.testHooks)
      }
    }

    const currentOwner = (await readActiveClaims(lockPath, input.testHooks))[0]
    if (currentOwner?.token === claim.token) {
      let released = false
      return {
        async release() {
          if (released) return
          await input.testHooks?.beforeRelease?.()
          await appendLockRecord(lockPath, {
            kind: 'release',
            token: claim.token,
            createdAt: new Date().toISOString(),
          }, input.testHooks)
          released = true
        },
      }
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      await appendLockRecord(lockPath, {
        kind: 'release',
        token: claim.token,
        createdAt: new Date().toISOString(),
      }, input.testHooks)
      throw timeoutError()
    }
    await wait(Math.min(retryDelayMs, remainingMs))
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS)
  }
}
