import path from 'node:path'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'
import { loadProjectLibraryConfig } from '../projectLibrary/config'
import { createProjectLibraryStore } from '../projectLibrary/store'
import { readStoryDriveLinks } from '../projectLibrary/storyDriveLinks'
import { withProjectMemoryLock } from '../projectMemory/store'
import { appealsForCommit } from './appealTicket'
import { deliverPendingAppeals, enqueueAppeals, LINKS_UNREADABLE, type AppealDestination } from './appealOutbox'

// Wires canon appeals into the memory store: appeals are queued inside the
// commit's project lock and delivered to Story-drive after the lock is
// released. Neither step can fail, delay or undo a memory commit.

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const inFlight = new Set<Promise<void>>()

/**
 * Where this project's appeals go. A project with no Story-drive link raises no
 * appeals (`'unlinked'`). An unreadable registry is not the same as no link: the
 * caller still queues, so nothing is lost, and delivery says why it waits.
 */
export async function storyDriveDestination(projectPath: string, projectId: string): Promise<AppealDestination | 'unlinked'> {
  try {
    return (await readStoryDriveLinks(path.dirname(projectPath))).links[projectId]?.root ?? 'unlinked'
  } catch (error) {
    console.error(`The Story-drive link registry could not be read; appeals will retry: ${reasonOf(error)}`)
    return LINKS_UNREADABLE
  }
}

// Call only under the project lock, after the commit is written. Never throws.
export async function recordAppealsInLock(
  projectPath: string,
  before: ProjectMemorySnapshot,
  after: ProjectMemorySnapshot,
  now: string,
): Promise<void> {
  try {
    const appeals = appealsForCommit(before, after, now)
    if (appeals.length === 0) return
    if (await storyDriveDestination(projectPath, after.projectId) === 'unlinked') return
    await enqueueAppeals(projectPath, appeals, now)
  } catch (error) {
    console.error(`A canon appeal could not be queued for ${projectPath}: ${reasonOf(error)}`)
  }
}

// Fire-and-forget; call after the project lock is released. Does nothing for a
// project with no Story-drive link.
export function scheduleAppealDelivery(projectPath: string, projectId: string): void {
  const run = new Promise<void>(resolve => setImmediate(resolve)).then(async () => {
    const destination = await storyDriveDestination(projectPath, projectId)
    if (destination === 'unlinked') return
    await deliverPendingAppeals(projectPath, destination, {
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
