import type { Express, Response } from 'express'
import { z } from 'zod'
import type { ProjectLibraryConfig } from '../projectLibrary/config'
import { ProjectLibraryStoreError, type ProjectLibraryStore } from '../projectLibrary/store'
import { authenticated, sameOrigin } from '../projectLibrary/security'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'
import {
  ProjectMemoryStoreError,
  projectMemoryStore,
  type ProjectMemoryStore,
} from './store'
import { buildMemoryContext } from './retrieval'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

export type ProjectMemoryAnalyzeHandler = (input: {
  projectId: string
  request: unknown
  snapshot: ProjectMemorySnapshot
}) => Promise<unknown>

const MemoryContextQuerySchema = z.object({
  query: z.string().max(8_000).default(''),
  surface: z.string().max(200).optional(),
  personaId: z.string().max(200).optional(),
  currentEntities: z.union([z.string(), z.array(z.string())]).optional(),
}).strict()

function validatedProjectId(value: string): string {
  if (!WRITEROS_PROJECT_ID_PATTERN.test(value)) {
    throw new ProjectLibraryStoreError(
      'Project memory requires a valid project id.',
      400,
      'invalid-project-id',
    )
  }
  return value
}

function libraryStore(
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
): ProjectLibraryStore {
  if (!config.enabled || !store) {
    throw new ProjectLibraryStoreError('Project memory is unavailable for this project.', 503, 'disabled')
  }
  return store
}

function routeError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'invalid-request',
      message: 'Project memory request is invalid.',
    })
  }
  if (error instanceof ProjectLibraryStoreError) {
    if (error.code === 'disabled') {
      return res.status(503).json({ error: 'disabled', message: 'Project memory is unavailable for this project.' })
    }
    if (error.code === 'not-found') {
      return res.status(404).json({ error: 'not-found', message: 'WriterOS project was not found.' })
    }
    if (error.statusCode < 500) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.code === 'project-mismatch'
          ? 'URL project id does not match the WriterOS project package.'
          : error.code === 'invalid-project-id'
            ? 'Project memory requires a valid project id.'
          : 'Project memory request is invalid.',
      })
    }
    return res.status(error.statusCode).json({
      error: 'project-memory-failed',
      message: 'WriterOS could not access project memory.',
    })
  }
  if (error instanceof ProjectMemoryStoreError) {
    if (error.code === 'revision-conflict') {
      return res.status(409).json({
        error: 'revision-conflict',
        message: 'Project memory changed. Refresh and try again.',
      })
    }
    if (error.code === 'not-found') {
      return res.status(404).json({ error: 'not-found', message: 'Project memory item was not found.' })
    }
    if (error.code === 'corrupt-ledger' || error.code === 'invalid-project') {
      return res.status(503).json({
        error: error.code,
        message: 'Project memory is unavailable and needs repair.',
      })
    }
    if (error.code === 'unresolved-conflict') {
      return res.status(409).json({ error: error.code, message: 'Project memory still has an unresolved conflict.' })
    }
    return res.status(400).json({ error: error.code, message: 'Project memory request is invalid.' })
  }
  console.error('Project memory route failed with an unexpected error.')
  return res.status(500).json({
    error: 'project-memory-failed',
    message: 'WriterOS could not access project memory.',
  })
}

export function registerProjectMemoryRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  projectLibraryStore: ProjectLibraryStore | null,
  memoryStore: ProjectMemoryStore = projectMemoryStore,
  analyze?: ProjectMemoryAnalyzeHandler,
): void {
  const requireSameOrigin = sameOrigin(config, 'Project memory')
  const requireSession = authenticated(config, 'Project memory')

  app.use('/api/project-memory', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/project-memory/:projectId/snapshot', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const snapshot = await memoryStore.readSnapshot(projectPath)
      if (snapshot.projectId !== projectId) {
        throw new ProjectLibraryStoreError(
          'URL project id does not match the WriterOS project package.',
          400,
          'project-mismatch',
        )
      }
      return res.json({ snapshot })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.get('/api/project-memory/:projectId/context', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const query = MemoryContextQuerySchema.parse(req.query)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const snapshot = await memoryStore.readSnapshot(projectPath)
      if (snapshot.projectId !== projectId) {
        throw new ProjectLibraryStoreError(
          'URL project id does not match the WriterOS project package.',
          400,
          'project-mismatch',
        )
      }
      const currentEntities = query.currentEntities === undefined
        ? undefined
        : (Array.isArray(query.currentEntities) ? query.currentEntities : [query.currentEntities])
          .flatMap(value => value.split(','))
          .map(value => value.trim())
          .filter(Boolean)
      const context = buildMemoryContext(snapshot, {
        message: query.query,
        ...(query.surface === undefined ? {} : { surface: query.surface }),
        ...(query.personaId === undefined ? {} : { personaId: query.personaId }),
        ...(currentEntities === undefined ? {} : { currentEntities }),
      })
      return res.json({ context })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.post('/api/project-memory/:projectId/actions', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const before = await memoryStore.readSnapshot(projectPath)
      if (before.projectId !== projectId) {
        throw new ProjectLibraryStoreError(
          'URL project id does not match the WriterOS project package.',
          400,
          'project-mismatch',
        )
      }
      const snapshot = await memoryStore.applyAction(projectPath, req.body)
      if (snapshot.projectId !== projectId) {
        throw new ProjectLibraryStoreError(
          'URL project id does not match the WriterOS project package.',
          400,
          'project-mismatch',
        )
      }
      return res.json({ snapshot })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.post('/api/project-memory/:projectId/analyze', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const snapshot = await memoryStore.readSnapshot(projectPath)
      if (snapshot.projectId !== projectId) {
        throw new ProjectLibraryStoreError(
          'URL project id does not match the WriterOS project package.',
          400,
          'project-mismatch',
        )
      }
      if (analyze) {
        const analysis = await analyze({ projectId, request: req.body, snapshot })
        return res.json({ analysis, revision: snapshot.revision })
      }
      return res.status(503).json({
        error: 'analysis-unavailable',
        message: 'Project memory analysis is unavailable.',
      })
    } catch (error) {
      return routeError(res, error)
    }
  })
}
