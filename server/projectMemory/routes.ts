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
import { readAnalysisQueue, processQueueItem, type AnalysisQueueItem } from './writerOSObserver'
import { createModelProvider, type ModelProvider } from '../ai/modelProvider'
import { readWhatsStandingReport } from './whatsStandingReport'
import { annotationStore, AnnotationStoreError } from './annotationStore'
import { WhatsStandingAnswerRequestSchema } from '../../shared/whatsStandingPanel'

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

// Task 9: the Memory surface's "pending / failed WriterOS analysis" list and
// its per-item manual retry. These are kept as their own path arrays (rather
// than folded into PROJECT_MEMORY_ROUTE_PATHS) only because Express needs
// concrete path strings to register app.get/app.post against — they ARE
// still part of the same classified, hardened surface: classifyProjectMemoryPath
// below gained two additive branches (isAnalysisRetryPath, and an
// 'analysis-queue' arm on the existing `endpoint` check) that recognize these
// exact shapes, so both routes go through the identical mount-level
// same-origin+session boundary, JSON-parser gating, and method-not-allowed/404
// catch-all that PROJECT_MEMORY_ROUTE_PATHS's endpoints get — see
// registerProjectMemorySecurityBoundary and tests/server/projectMemoryRoutes.test.ts's
// "project memory analysis-queue routes" coverage. The two `app.get`/`app.post`
// calls below additionally apply requireSameOrigin/requireSession directly,
// exactly mirroring how every other endpoint in this function already
// double-guards itself on top of the mount-level boundary.
const ANALYSIS_QUEUE_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/analysis-queue`)
const ANALYSIS_RETRY_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/analysis-queue/:itemId/retry`)

// The What's Standing panel's report (Task 3's readWhatsStandingReport) and its one write
// path, answering a pending reference question (Task 2's annotationStore.answerQuestion).
// Same treatment as the analysis-queue routes above: additive-only path arrays and
// classifier branches, going through the identical mount-level boundary and double-guarded
// with requireSameOrigin/requireSession at registration.
const WHATS_STANDING_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/whats-standing`)
const WHATS_STANDING_ANSWER_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/whats-standing/answer`)

/** Never exposes priorText/currentText — the queue keeps up to 20k characters
 * of document/scene content per item purely for re-analysis; the Memory
 * surface only needs enough to identify and retry an item. */
function summarizeQueueItem(item: AnalysisQueueItem) {
  return {
    id: item.id,
    surface: item.surface,
    sourceUri: item.sourceUri,
    status: item.status,
    ...(item.error !== undefined ? { error: item.error } : {}),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

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
    return expressRequestTargetPathname(requestTarget)
  } catch {
    return undefined
  }
}

// Mirrors parseurl@1.3.3's fastparse behavior used by Express 4.22.1. Origin-form
// targets keep literal backslashes; absolute and exceptional targets use node:url.
function expressRequestTargetPathname(requestTarget: string): string | undefined {
  if (requestTarget.charCodeAt(0) !== 0x2f) return parseUrl(requestTarget).pathname ?? undefined

  let pathname = requestTarget
  let hasSearch = false
  for (let index = 1; index < requestTarget.length; index += 1) {
    switch (requestTarget.charCodeAt(index)) {
      case 0x3f: // ?
        if (!hasSearch) {
          pathname = requestTarget.substring(0, index)
          hasSearch = true
        }
        break
      case 0x09: // tab
      case 0x0a: // newline
      case 0x0c: // form feed
      case 0x0d: // carriage return
      case 0x20: // space
      case 0x23: // #
      case 0xa0: // non-breaking space
      case 0xfeff: // byte-order mark
        return parseUrl(requestTarget).pathname ?? undefined
    }
  }
  return pathname
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
  // Task 9's analysis-queue retry is the one project-memory endpoint with a
  // sub-resource id in its path (.../analysis-queue/:itemId/retry), so it
  // cannot be recognized by the single-segment `endpoint` check above. This
  // is purely additive alongside it: `endpoint` and its two existing
  // branches are unchanged, so every previously-classified shape (including
  // its trailing-slash handling) still resolves exactly as before.
  const isAnalysisRetryPath = (
    endpointSegments.length === 3 || (endpointSegments.length === 4 && endpointSegments[3] === '')
  )
    && endpointSegments[0]?.toLowerCase() === 'analysis-queue'
    && endpointSegments[2]?.toLowerCase() === 'retry'
  // The What's Standing panel's answer endpoint (.../whats-standing/answer) is the second
  // project-memory endpoint with a two-segment shape, so it needs the same additive
  // treatment as isAnalysisRetryPath above: `endpoint` and every existing branch are
  // unchanged, so every previously-classified shape still resolves exactly as before.
  const isWhatsStandingAnswerPath = (
    endpointSegments.length === 2 || (endpointSegments.length === 3 && endpointSegments[2] === '')
  )
    && endpointSegments[0]?.toLowerCase() === 'whats-standing'
    && endpointSegments[1]?.toLowerCase() === 'answer'
  const expectedMethod = endpoint === 'snapshot' || endpoint === 'context'
    ? 'GET'
    : endpoint === 'actions' || endpoint === 'analyze'
      ? 'POST'
      : endpoint === 'analysis-queue' || endpoint === 'whats-standing'
        ? 'GET'
        : isAnalysisRetryPath || isWhatsStandingAnswerPath
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
  analysisProvider?: ModelProvider,
): void {
  const requireSameOrigin = sameOrigin(config, 'Project memory')
  const requireSession = authenticated(config, 'Project memory')
  // Resolved lazily, only inside the retry handler below — never at
  // registration time. Other tests assert that closed/unrelated endpoints
  // never construct a model provider as a side effect of the app simply
  // starting up; constructing one eagerly here would violate that even
  // though ModelProvider construction itself is cheap (no key validation
  // happens until generateResponse is actually called).
  const getAnalysisProvider = () => analysisProvider ?? createModelProvider()

  registerProjectMemorySecurityBoundary(app, config)

  app.get(PROJECT_MEMORY_ROUTE_PATHS.snapshot, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const snapshot = await memoryStore.readSnapshot(projectPath, projectId)
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
      const snapshot = await memoryStore.readSnapshot(projectPath, projectId)
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
      const before = await memoryStore.readSnapshot(projectPath, projectId)
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
      const snapshot = await memoryStore.readSnapshot(projectPath, projectId)
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

  // Task 9: list pending/failed WriterOS document-analysis items (Task 8's
  // memory/analysis-queue.json) for the Memory surface.
  app.get(ANALYSIS_QUEUE_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const items = await readAnalysisQueue(projectPath)
      return res.json({
        items: items
          .filter(item => item.status === 'pending' || item.status === 'failed')
          .map(summarizeQueueItem),
      })
    } catch (error) {
      return routeError(res, error)
    }
  })

  // Task 9: explicit, per-item manual retry of a failed analysis item. There
  // is no automatic retry anywhere (see writerOSObserver.ts) — this is the
  // only way a failed item ever gets reprocessed.
  app.post(ANALYSIS_RETRY_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const itemId = req.params.itemId
      const projectPath = await libraryStore(config, projectLibraryStore)
        .resolveProjectPackagePath(projectId)
      const items = await readAnalysisQueue(projectPath)
      const item = items.find(entry => entry.id === itemId)
      if (!item) {
        return res.status(404).json({ error: 'not-found', message: 'Analysis queue item was not found.' })
      }
      if (item.status !== 'failed') {
        return res.status(409).json({ error: 'not-retryable', message: 'Only failed analysis items can be retried.' })
      }
      await processQueueItem(memoryStore, getAnalysisProvider(), projectPath, projectId, item)
      const refreshedItems = await readAnalysisQueue(projectPath)
      const refreshed = refreshedItems.find(entry => entry.id === itemId)
      return res.json({ item: refreshed ? summarizeQueueItem(refreshed) : null })
    } catch (error) {
      return routeError(res, error)
    }
  })

  // What's Standing panel: the deterministic report plus its pending reference questions.
  app.get(WHATS_STANDING_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const projectPath = await libraryStore(config, projectLibraryStore).resolveProjectPackagePath(projectId)
      const result = await readWhatsStandingReport(projectPath)
      if (!result.ok) return res.status(503).json({ error: 'report-unavailable', message: result.reason })
      return res.json(result.payload)
    } catch (error) {
      return routeError(res, error)
    }
  })

  // What's Standing panel: the only write path, answering one pending reference question.
  app.post(WHATS_STANDING_ANSWER_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
    try {
      const projectId = validatedProjectId(req.params.projectId)
      const request = WhatsStandingAnswerRequestSchema.parse(req.body)
      const projectPath = await libraryStore(config, projectLibraryStore).resolveProjectPackagePath(projectId)
      await annotationStore.answerQuestion(projectPath, {
        annotationId: request.annotationId,
        questionVersion: request.questionVersion,
        answer: request.answer,
        runId: `panel-answer`,
      })
      const result = await readWhatsStandingReport(projectPath)
      if (!result.ok) return res.status(503).json({ error: 'report-unavailable', message: result.reason })
      return res.json(result.payload)
    } catch (error) {
      if (error instanceof AnnotationStoreError) {
        const status = error.reason === 'not-found' ? 404
          : error.reason === 'conflict' ? 409
          : error.reason === 'invalid-input' ? 400
          : 500
        return res.status(status).json({ error: `annotation-${error.reason}`, message: error.message })
      }
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
