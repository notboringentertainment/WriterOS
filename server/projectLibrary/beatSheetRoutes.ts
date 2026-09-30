import { isDeepStrictEqual } from 'node:util'
import type { Express, Request, Response } from 'express'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { BeatSheetSyncStatus } from '../projectMemory/beatSheetSync'
import { syncBeatSheet } from '../projectMemory/beatSheetSync'
import type { ProjectLibraryConfig } from './config'
import { authenticated, sameOrigin } from './security'
import { ProjectLibraryStoreError, type ProjectLibraryStore } from './store'

function unavailable(error: unknown): BeatSheetSyncStatus {
  return { kind: 'unavailable', ticket: null, message: error instanceof Error ? error.message : String(error) }
}

/**
 * Best-effort sync on project open. Never throws: the read must succeed even
 * when Story-drive is missing, the registry is malformed or outline.json is bad.
 */
export async function refreshBeatSheetOnOpen(
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore,
  projectId: string,
): Promise<BeatSheetSyncStatus> {
  try {
    if (!config.rootPath) return { kind: 'not-linked' }
    let packagePath: string
    try {
      packagePath = await store.resolveProjectPackagePath(projectId)
    } catch (error) {
      // Let readProject raise the real (e.g. not-found) error.
      return unavailable(error)
    }
    const { status } = await syncBeatSheet({
      workspaceRoot: config.rootPath,
      packagePath,
      projectId,
      timeoutMs: 1500,
    })
    return status
  } catch (error) {
    console.warn('[beat-sheet] refresh on open failed:', error instanceof Error ? error.message : error)
    return unavailable(error)
  }
}

/**
 * D9: units and beatSheetSource are server-owned once a package has a beat
 * sheet source. A stale browser save must not undo a sync.
 */
export function keepServerOwnedBeatFields(
  prior: StoredProject | null,
  incoming: StoredProject,
): { project: StoredProject; replaced: boolean } {
  const priorOutline = prior?.state.documents.outline
  if (!prior || !priorOutline || !priorOutline.content.beatSheetSource) {
    return { project: incoming, replaced: false }
  }
  const incomingOutline = incoming.state.documents.outline
  const replaced =
    !isDeepStrictEqual(incomingOutline.content.units, priorOutline.content.units)
    || !isDeepStrictEqual(incomingOutline.content.beatSheetSource, priorOutline.content.beatSheetSource)

  const merged = {
    ...incomingOutline,
    content: {
      ...incomingOutline.content,
      units: priorOutline.content.units,
      beatSheetSource: priorOutline.content.beatSheetSource,
    },
  }
  const outline = isDeepStrictEqual(merged.content, priorOutline.content)
    ? priorOutline
    : { ...merged, revision: Math.max(incomingOutline.revision, priorOutline.revision) }

  return {
    project: {
      ...incoming,
      state: { ...incoming.state, documents: { ...incoming.state.documents, outline } },
    },
    replaced,
  }
}

function routeError(res: Response, error: unknown) {
  if (error instanceof ProjectLibraryStoreError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message })
  }
  console.error('Beat sheet route failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'project-library-failed', message: 'WriterOS could not access the project library.' })
}

export function registerBeatSheetRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
): void {
  const requireSameOrigin = sameOrigin(config)
  const requireSession = authenticated(config)

  async function run(
    req: Request,
    res: Response,
    options: { write: boolean; timeoutMs?: number },
  ) {
    try {
      if (!config.enabled || !store || !config.rootPath) {
        throw new ProjectLibraryStoreError('Server project library is disabled.', 503, 'disabled')
      }
      const projectId = req.params.projectId
      const packagePath = await store.resolveProjectPackagePath(projectId)
      try {
        return await syncBeatSheet({
          workspaceRoot: config.rootPath,
          packagePath,
          projectId,
          write: options.write,
          timeoutMs: options.timeoutMs,
        })
      } catch (error) {
        if (error instanceof ProjectLibraryStoreError) throw error
        console.warn('[beat-sheet] sync failed:', error instanceof Error ? error.message : error)
        return { status: unavailable(error) } as { status: BeatSheetSyncStatus; outline?: undefined }
      }
    } catch (error) {
      routeError(res, error)
      return null
    }
  }

  app.post('/api/project-library/projects/:projectId/beat-sheet/refresh', requireSameOrigin, requireSession, async (req, res) => {
    const result = await run(req, res, { write: true, timeoutMs: 10_000 })
    if (result) res.json({ beatSheet: result.status, outline: result.outline ?? null })
  })

  app.get('/api/project-library/projects/:projectId/beat-sheet/status', requireSameOrigin, requireSession, async (req, res) => {
    const result = await run(req, res, { write: false })
    if (result) res.json({ beatSheet: result.status })
  })
}
