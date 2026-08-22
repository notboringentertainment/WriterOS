import type { Express, Response } from 'express'
import { z } from 'zod'
import { migrateState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { serializeWriterOSProjectPackage } from '../../client/src/lib/projectPackage'
import { SaveProjectRequestSchema } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from './config'
import { authenticated, sameOrigin } from './security'
import {
  ProjectLibraryStoreError,
  type ProjectLibraryStore,
} from './store'
import { observeWriterOSSave } from '../projectMemory/writerOSObserver'

function dataStore(config: ProjectLibraryConfig, store: ProjectLibraryStore | null): ProjectLibraryStore {
  if (!config.enabled || !store) {
    throw new ProjectLibraryStoreError('Server project library is disabled.', 503, 'disabled')
  }
  return store
}

function routeError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'invalid-request', message: 'Project request is invalid.' })
  }
  if (error instanceof ProjectLibraryStoreError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message })
  }
  console.error('Project library route failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'project-library-failed', message: 'WriterOS could not access the project library.' })
}

export function registerProjectLibraryRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
): void {
  const requireSameOrigin = sameOrigin(config)
  const requireSession = authenticated(config)

  app.use('/api/project-library', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/project-library/bootstrap', requireSameOrigin, (_req, res) => {
    if (!config.enabled || !config.label) {
      return res.json({ enabled: false })
    }
    return res.json({
      enabled: true,
      label: config.label,
      sessionToken: config.sessionToken,
    })
  })

  app.get('/api/project-library/projects', requireSameOrigin, requireSession, async (_req, res) => {
    try {
      const entries = await dataStore(config, store).listProjects()
      return res.json({ entries })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.get('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const result = await dataStore(config, store).readProject(req.params.projectId)
      return res.json({ result })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.delete('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const result = await dataStore(config, store).removeProject(req.params.projectId)
      return res.json({ ok: true, alreadyMissing: result.alreadyMissing })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.put('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const data = SaveProjectRequestSchema.parse(req.body)
      if (req.params.projectId !== data.project.id) {
        throw new ProjectLibraryStoreError('URL project id must match request project id.', 400, 'id-mismatch')
      }
      const project: StoredProject = {
        ...data.project,
        state: migrateState(data.project.state),
      }
      const activeStore = dataStore(config, store)

      // Best-effort "before" snapshot for the WriterOS memory observer. A new
      // project (or a read failure) simply means there is nothing prior to
      // diff against — it must never block or fail the save itself.
      let priorFiles: Record<string, string | undefined> | null = null
      try {
        const priorRead = await activeStore.readProject(project.id)
        if (priorRead.ok) priorFiles = serializeWriterOSProjectPackage(priorRead.project).files
      } catch (error) {
        if (!(error instanceof ProjectLibraryStoreError) || error.code !== 'not-found') {
          console.warn('[project-library] prior read for memory observer failed:', error instanceof Error ? error.message : error)
        }
      }

      const ref = await activeStore.writeProject(project)

      // Diff + queue happens after the save succeeds but before the response
      // returns; the LLM analysis itself runs afterwards in the background
      // and can never fail this save (see server/projectMemory/writerOSObserver.ts).
      // Only edits to an already-existing package are diffed — the empty
      // scaffold produced at project creation has nothing prior to compare
      // against and nothing worth analyzing yet.
      if (priorFiles !== null) {
        try {
          const currentFiles = serializeWriterOSProjectPackage(project).files
          const projectPath = await activeStore.resolveProjectPackagePath(project.id)
          await observeWriterOSSave({ projectId: project.id, projectPath, priorFiles, currentFiles })
        } catch (error) {
          console.warn('[project-library] WriterOS memory observer failed:', error instanceof Error ? error.message : error)
        }
      }

      return res.json({ ref })
    } catch (error) {
      return routeError(res, error)
    }
  })
}
