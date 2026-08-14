import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { parse as parseUrl } from 'node:url'
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
import {
  ProjectMemoryAnalysisRequestSchema,
  ProjectMemoryAnalysisResponseSchema,
  ProjectMemoryAnalysisResultSchema,
  type ProjectMemoryAnalysisRequest,
  type ProjectMemoryAnalysisResult,
  type ProjectMemorySnapshot,
} from '../../shared/projectMemory'

export type ProjectMemoryAnalyzeHandler = (input: {
  projectId: string
  request: ProjectMemoryAnalysisRequest
  snapshot: ProjectMemorySnapshot
}) => Promise<ProjectMemoryAnalysisResult | unknown>

const PROJECT_MEMORY_PREFIXES = [
  '/api/project-memory/:projectId',
  '/api/projects/:projectId/memory',
] as const

const PROJECT_MEMORY_SECURITY_MOUNTS = [
  '/api/project-memory',
  '/api/projects',
] as const

const PROJECT_MEMORY_ROUTE_PATHS = {
  snapshot: PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/snapshot`),
  context: PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/context`),
  actions: PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/actions`),
  analyze: PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/analyze`),
} as const

const trustedProjectMemoryParserErrors = new WeakSet<object>()

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

function projectMemoryRequestPath(req: Pick<Request, 'originalUrl' | 'url'>): string | undefined {
  const requestTarget = typeof req.originalUrl === 'string' ? req.originalUrl : req.url
  try {
    return parseUrl(requestTarget).pathname ?? undefined
  } catch {
    return undefined
  }
}

type ProjectMemoryExpectedMethod = 'GET' | 'POST'

type ProjectMemoryPathClassification = {
  encodedProjectId: string
  expectedMethod: ProjectMemoryExpectedMethod | undefined
}

function classifyProjectMemoryPath(
  requestPath: string | undefined,
): ProjectMemoryPathClassification | undefined {
  if (!requestPath?.startsWith('/')) return undefined
  const segments = requestPath.split('/')
  if (segments[0] !== '' || segments[1]?.toLowerCase() !== 'api') return undefined

  let encodedProjectId: string
  let endpointSegments: string[]
  if (segments[2]?.toLowerCase() === 'project-memory') {
    encodedProjectId = segments[3] ?? ''
    endpointSegments = segments.slice(4)
  } else if (
    segments[2]?.toLowerCase() === 'projects'
    && segments[4]?.toLowerCase() === 'memory'
  ) {
    encodedProjectId = segments[3] ?? ''
    endpointSegments = segments.slice(5)
  } else {
    return undefined
  }

  const endpoint = endpointSegments.length === 1
    ? endpointSegments[0]?.toLowerCase()
    : endpointSegments.length === 2 && endpointSegments[1] === ''
      ? endpointSegments[0]?.toLowerCase()
      : undefined
  const expectedMethod = endpoint === 'snapshot' || endpoint === 'context'
    ? 'GET'
    : endpoint === 'actions' || endpoint === 'analyze'
      ? 'POST'
      : undefined
  return { encodedProjectId, expectedMethod }
}

function hasRequestBody(req: Request): boolean {
  const contentLength = Number(req.headers['content-length'])
  return req.headers['transfer-encoding'] !== undefined
    || (Number.isFinite(contentLength) && contentLength > 0)
}

function continueSupportedProjectMemoryRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  expectedMethod: ProjectMemoryExpectedMethod | undefined,
) {
  if (expectedMethod === undefined) {
    return res.status(404).json({
      error: 'not-found',
      message: 'Project memory endpoint was not found.',
    })
  }
  if (req.method !== expectedMethod) {
    res.setHeader('Allow', expectedMethod)
    return res.status(405).json({
      error: 'method-not-allowed',
      message: 'Project memory request method is not allowed.',
    })
  }
  return next()
}

export function registerProjectMemorySecurityBoundary(
  app: Express,
  config: ProjectLibraryConfig,
): void {
  const requireSameOrigin = sameOrigin(config, 'Project memory')
  const requireSession = authenticated(config, 'Project memory')
  for (const mount of PROJECT_MEMORY_SECURITY_MOUNTS) {
    app.use(mount, (req, res, next) => {
      const requestPath = projectMemoryRequestPath(req)
      const classification = classifyProjectMemoryPath(requestPath)
      if (!classification) return next()
      res.setHeader('Cache-Control', 'no-store')
      return requireSameOrigin(req, res, () => requireSession(req, res, () => {
        let projectId: string
        try {
          projectId = decodeURIComponent(classification.encodedProjectId)
        } catch {
          return res.status(400).json({
            error: 'invalid-project-id',
            message: 'Project memory requires a valid project id.',
          })
        }
        if (!WRITEROS_PROJECT_ID_PATTERN.test(projectId)) {
          return res.status(400).json({
            error: 'invalid-project-id',
            message: 'Project memory requires a valid project id.',
          })
        }
        return continueSupportedProjectMemoryRequest(req, res, next, classification.expectedMethod)
      }))
    })
  }
}

export function createNonProjectMemoryBodyParser(parser: RequestHandler): RequestHandler {
  return (req, res, next) => classifyProjectMemoryPath(projectMemoryRequestPath(req))
    ? next()
    : parser(req, res, next)
}

export function createProjectMemoryJsonParser(limit: string | number): RequestHandler {
  const parser = express.json({ limit })
  return (req, res, next) => {
    const requestPath = projectMemoryRequestPath(req)
    const classification = classifyProjectMemoryPath(requestPath)
    if (!classification) return next()
    const hasBody = hasRequestBody(req)
    if (classification.expectedMethod === 'GET' && hasBody) {
      return res.status(400).json({
        error: 'unexpected-body',
        message: 'Project memory read requests must not include a body.',
      })
    }
    if (
      classification.expectedMethod === 'POST'
      && hasBody
      && !req.is('application/json')
    ) {
      return res.status(415).json({
        error: 'unsupported-body',
        message: 'Project memory request body encoding or media type is unsupported.',
      })
    }
    return parser(req, res, error => {
      if (error !== null && typeof error === 'object') {
        trustedProjectMemoryParserErrors.add(error)
      }
      return next(error)
    })
  }
}

export function projectMemoryJsonErrorBoundary(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    !classifyProjectMemoryPath(projectMemoryRequestPath(req))
    || error === null
    || typeof error !== 'object'
  ) return next(error)
  const type = 'type' in error && typeof error.type === 'string' ? error.type : undefined
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined

  if (trustedProjectMemoryParserErrors.has(error)) {
    if (status === 415) {
      return res.status(status).json({
        error: 'unsupported-body',
        message: 'Project memory request body encoding or media type is unsupported.',
      })
    }
    if (status === 413) {
      return res.status(status).json({
        error: 'payload-too-large',
        message: 'Project memory request body exceeds the allowed size.',
      })
    }
    if (status === 400) {
      return res.status(status).json(type === 'entity.parse.failed'
        ? {
            error: 'invalid-json',
            message: 'Project memory request body is invalid JSON.',
          }
        : {
            error: 'invalid-body',
            message: 'Project memory request body could not be read.',
      })
    }
  }
  next(error)
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

  registerProjectMemorySecurityBoundary(app, config)

  app.get(PROJECT_MEMORY_ROUTE_PATHS.snapshot, requireSameOrigin, requireSession, async (req, res) => {
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

  app.get(PROJECT_MEMORY_ROUTE_PATHS.context, requireSameOrigin, requireSession, async (req, res) => {
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

  app.post(PROJECT_MEMORY_ROUTE_PATHS.actions, requireSameOrigin, requireSession, async (req, res) => {
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
      const snapshot = await memoryStore.applyAction(projectPath, req.body, projectId)
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

  app.post(PROJECT_MEMORY_ROUTE_PATHS.analyze, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const request = ProjectMemoryAnalysisRequestSchema.parse(req.body)
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
        const result = ProjectMemoryAnalysisResultSchema.safeParse(
          await analyze({ projectId, request, snapshot }),
        )
        if (!result.success) {
          return res.status(502).json({
            error: 'analysis-invalid',
            message: 'Project memory analysis returned an invalid result.',
          })
        }
        return res.json(ProjectMemoryAnalysisResponseSchema.parse({
          analysis: result.data,
          revision: snapshot.revision,
        }))
      }
      return res.status(503).json({
        error: 'analysis-unavailable',
        message: 'Project memory analysis is unavailable.',
      })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.use((req, res, next) => {
    const requestPath = projectMemoryRequestPath(req)
    const classification = classifyProjectMemoryPath(requestPath)
    if (!classification) return next()
    const { expectedMethod } = classification
    if (expectedMethod !== undefined) {
      res.setHeader('Allow', expectedMethod)
      return res.status(405).json({
        error: 'method-not-allowed',
        message: 'Project memory request method is not allowed.',
      })
    }
    return res.status(404).json({
      error: 'not-found',
      message: 'Project memory endpoint was not found.',
    })
  })
}
