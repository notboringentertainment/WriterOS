import path from 'node:path'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'
import { loadProjectLibraryConfig } from '../projectLibrary/config'
import { createProjectLibraryStore } from '../projectLibrary/store'
import { readStoryDriveLinks } from '../projectLibrary/storyDriveLinks'
import { withProjectMemoryLock } from '../projectMemory/store'
import { appealsForCommit } from './appealTicket'
import { deliverPendingAppeals, enqueueAppeals } from './appealOutbox'

// Wires canon appeals into the memory store: appeals are queued inside the
// commit's project lock and delivered to Story-drive after the lock is
// released. Neither step can fail, delay or undo a memory commit.

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const inFlight = new Set<Promise<void>>()

// Call only under the project lock, after the commit is written. Never throws.
export async function recordAppealsInLock(
  projectPath: string,
  before: ProjectMemorySnapshot,
  after: ProjectMemorySnapshot,
  now: string,
): Promise<void> {
  try {
    await enqueueAppeals(projectPath, appealsForCommit(before, after, now), now)
  } catch (error) {
    console.error(`A canon appeal could not be queued for ${projectPath}: ${reasonOf(error)}`)
  }
}

// Fire-and-forget; call after the project lock is released.
export function scheduleAppealDelivery(projectPath: string, projectId: string): void {
  const run = new Promise<void>(resolve => setImmediate(resolve)).then(async () => {
    let root: string | null = null
    try {
      root = (await readStoryDriveLinks(path.dirname(projectPath))).links[projectId]?.root ?? null
    } catch (error) {
      console.error(`The Story-drive link registry could not be read; appeals will retry: ${reasonOf(error)}`)
    }
    await deliverPendingAppeals(projectPath, root, {
      withLock: fn => withProjectMemoryLock(projectPath, projectId, fn),
    })
  }).catch(error => {
    console.error(`Canon appeal delivery failed for ${projectPath}: ${reasonOf(error)}`)
  })
  inFlight.add(run)
  void run.finally(() => inFlight.delete(run))
}

/** Resolves once every delivery scheduled so far has finished (tests, shutdown). */
export async function appealDeliveriesSettled(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight])
}

// At server start, retry delivery for every linked project whose package exists.
export async function retryAppealDeliveriesAtStart(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    const config = await loadProjectLibraryConfig(env)
    if (!config.enabled || !config.rootPath) return
    const library = await createProjectLibraryStore(config.rootPath)
    const { links } = await readStoryDriveLinks(config.rootPath)
    for (const projectId of Object.keys(links)) {
      let projectPath: string
      try {
        projectPath = await library.resolveProjectPackagePath(projectId)
      } catch {
        continue
      }
      scheduleAppealDelivery(projectPath, projectId)
    }
  } catch (error) {
    console.error(`Canon appeals could not be retried at start: ${reasonOf(error)}`)
  }
}
