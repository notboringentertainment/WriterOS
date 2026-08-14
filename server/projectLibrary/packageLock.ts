import { createHash, randomBytes } from 'node:crypto'
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 5_000
const STALE_LOCK_AGE_MS = 15 * 60 * 1_000
const MIN_RETRY_DELAY_MS = 25
const MAX_RETRY_DELAY_MS = 250

interface PackageLockRecord {
  token: string
  hostname: string
  pid: number
  createdAt: string
}

export interface PackageWriteLock {
  release(): Promise<void>
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
      || typeof value.hostname !== 'string'
      || !Number.isSafeInteger(value.pid)
      || (value.pid ?? 0) <= 0
      || typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))
    ) {
      return null
    }
    return value as PackageLockRecord
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

async function recoverStaleLock(lockPath: string): Promise<boolean> {
  let stats
  try {
    stats = await lstat(lockPath)
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return true
    throw error
  }

  const expired = Date.now() - stats.mtimeMs > STALE_LOCK_AGE_MS
  let abandonedBySameHost = false
  if (!stats.isSymbolicLink()) {
    try {
      const record = parseLockRecord(await readFile(lockPath, 'utf8'))
      abandonedBySameHost = Boolean(
        record
        && record.hostname === hostname()
        && !processExists(record.pid),
      )
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return true
      throw error
    }
  }
  if (!expired && !abandonedBySameHost) return false

  const quarantinePath = `${lockPath}.stale-${process.pid}-${randomBytes(8).toString('hex')}`
  try {
    await rename(lockPath, quarantinePath)
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return true
    throw error
  }
  await unlink(quarantinePath).catch(error => {
    if (!isNodeError(error, 'ENOENT')) throw error
  })
  return true
}

function timeoutError(): Error & { code: string } {
  return Object.assign(
    new Error('Timed out waiting for the WriterOS project package lock.'),
    { code: 'lock-timeout' },
  )
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

export async function acquirePackageWriteLock(input: {
  workspaceRoot: string
  projectId: string
  timeoutMs?: number
}): Promise<PackageWriteLock> {
  const lockPath = packageLockPath(input.workspaceRoot, input.projectId)
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + Math.max(0, timeoutMs)
  let retryDelayMs = MIN_RETRY_DELAY_MS

  while (true) {
    const record: PackageLockRecord = {
      token: randomBytes(16).toString('hex'),
      hostname: hostname(),
      pid: process.pid,
      createdAt: new Date().toISOString(),
    }
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
      } catch (error) {
        await handle.close()
        await unlink(lockPath).catch(() => undefined)
        throw error
      }
      await handle.close()

      let released = false
      return {
        async release() {
          if (released) return
          released = true
          try {
            const current = parseLockRecord(await readFile(lockPath, 'utf8'))
            if (current?.token === record.token) await unlink(lockPath)
          } catch (error) {
            if (!isNodeError(error, 'ENOENT')) throw error
          }
        },
      }
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) throw error
    }

    if (await recoverStaleLock(lockPath)) continue
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw timeoutError()
    await wait(Math.min(retryDelayMs, remainingMs))
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS)
  }
}
