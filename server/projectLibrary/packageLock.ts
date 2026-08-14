import { createHash, randomBytes } from 'node:crypto'
import { appendFile, lstat, open } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 5_000
const STALE_LOCK_AGE_MS = 15 * 60 * 1_000
const MIN_RETRY_DELAY_MS = 25
const MAX_RETRY_DELAY_MS = 250

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
  /** @internal Exercises the removed pathname-check/delete race in regression tests. */
  afterLockRead?(lockPath: string): Promise<void>
  beforeRelease?(): Promise<void>
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

async function appendLockRecord(lockPath: string, record: PackageLockRecord): Promise<void> {
  await appendFile(lockPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'a' })
}

async function readActiveClaims(lockPath: string): Promise<PackageLockClaim[]> {
  const handle = await open(lockPath, 'r')
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw corruptLockError()
    const raw = await handle.readFile('utf8')
    if (raw.length === 0) return []

    const active = new Map<string, PackageLockClaim>()
    for (const line of raw.split('\n').filter(Boolean)) {
      const record = parseLockRecord(line)
      if (!record) throw corruptLockError()
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
  await appendLockRecord(lockPath, claim)

  while (true) {
    const activeClaims = await readActiveClaims(lockPath)
    for (const activeClaim of activeClaims) {
      if (activeClaim.token !== claim.token && claimCanBeRecovered(activeClaim)) {
        await appendLockRecord(lockPath, {
          kind: 'recover',
          token: activeClaim.token,
          createdAt: new Date().toISOString(),
        })
      }
    }

    const currentOwner = (await readActiveClaims(lockPath))[0]
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
          })
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
      })
      throw timeoutError()
    }
    await wait(Math.min(retryDelayMs, remainingMs))
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS)
  }
}
