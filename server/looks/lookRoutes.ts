import type { Express, Response } from 'express'
import { LookPromoteRequestSchema } from '../../shared/looks'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from '../projectLibrary/config'
import { authenticated, sameOrigin } from '../projectLibrary/security'
import { ProjectLibraryStoreError, type ProjectLibraryStore } from '../projectLibrary/store'
import { ProjectMemoryStoreError, projectMemoryStore, type ProjectMemoryStore } from '../projectMemory/store'
import { ensureCurrentLookExport, writeLookLocksExport } from './lookExport'
import { LookPromoteError, promoteLook } from './lookPromote'

// POST /api/looks/:projectId/promote — promote a writer-typed look into canon
//   and write the look-locks export (look sessions plan, Task 3).
// GET  /api/looks/:projectId/export  — the current export, regenerated under
//   the package lock when missing or stale (the panel's Re-export).

export interface LookRouteOptions {
  memoryStore?: ProjectMemoryStore
  /** @internal Replaced in tests to exercise a failing export write. */
  writeExport?: typeof writeLookLocksExport
}

function sendError(res: Response, error: unknown) {
  if (error instanceof LookPromoteError) {
    return res.status(error.status).json({ error: error.code, message: error.message, problems: error.problems })
  }
  if (error instanceof ProjectLibraryStoreError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message })
  }
  if (error instanceof ProjectMemoryStoreError) {
    const status = error.code === 'invalid-input' || error.code === 'invalid-payload' || error.code === 'invalid-action' ? 400
      : error.code === 'revision-conflict' ? 409
        : 500
    return res.status(status).json({ error: error.code, message: status === 500 ? 'Project memory could not be updated.' : error.message })
  }
  console.error('Look route failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'look-failed', message: 'The look could not be promoted.' })
}

export function registerLookRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
  options: LookRouteOptions = {},
): void {
  const memoryStore = options.memoryStore ?? projectMemoryStore

  async function projectPathFor(projectId: string): Promise<string> {
    if (!WRITEROS_PROJECT_ID_PATTERN.test(projectId)) {
      throw new ProjectLibraryStoreError('Looks require a valid project id.', 400, 'invalid-project-id')
    }
    if (!config.enabled || !store) {
      throw new ProjectLibraryStoreError('Server project library is disabled.', 503, 'disabled')
    }
    const read = await store.readProject(projectId)
    if (!read.ok || read.project.id !== projectId) {
      throw new ProjectLibraryStoreError('The project package could not be read.', 422, 'unreadable-project')
    }
    return store.resolveProjectPackagePath(projectId)
  }

  app.post('/api/looks/:projectId/promote', sameOrigin(config), authenticated(config), async (req, res) => {
    try {
      const body = LookPromoteRequestSchema.safeParse(req.body)
      if (!body.success) {
        return res.status(400).json({ error: 'invalid-request', message: 'The promote request is invalid.', problems: [] })
      }
      const projectId = req.params.projectId
      const projectPath = await projectPathFor(projectId)
      const response = await promoteLook({ memoryStore, projectPath, projectId, writeExport: options.writeExport }, body.data)
      return res.json(response)
    } catch (error) {
      return sendError(res, error)
    }
  })

  app.get('/api/looks/:projectId/export', sameOrigin(config), authenticated(config), async (req, res) => {
    try {
      const projectId = req.params.projectId
      const projectPath = await projectPathFor(projectId)
      const current = await ensureCurrentLookExport(memoryStore, projectPath, projectId)
      return res.json({ exportPath: current.relativePath, regenerated: current.regenerated, export: current.export })
    } catch (error) {
      return sendError(res, error)
    }
  })
}
