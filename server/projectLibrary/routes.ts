import { timingSafeEqual } from 'node:crypto'
import type { Express, NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { migrateState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { SaveProjectRequestSchema } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from './config'
import {
  ProjectLibraryStoreError,
  type ProjectLibraryStore,
} from './store'

function requestIsSameOrigin(req: Request, config: ProjectLibraryConfig): boolean {
  const origin = req.get('Origin')
  if (origin && config.allowedOrigins.has(origin)) return true

  // Chromium omits Origin on same-origin GET. Sec-Fetch-Site is browser-set,
  // and Host must still match an allowed loopback origin. Config separately
  // refuses server project storage when Express binds beyond loopback.
  const fetchSite = req.get('Sec-Fetch-Site')
  const host = req.get('Host')
  if (fetchSite !== 'same-origin' || !host) return false
  return [...config.allowedOrigins].some(allowedOrigin => new URL(allowedOrigin).host === host)
}

function tokenMatches(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

function sameOrigin(config: ProjectLibraryConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requestIsSameOrigin(req, config)) {
      return res.status(403).json({ error: 'forbidden', message: 'Project library request origin is not allowed.' })
    }
    next()
  }
}

function authenticated(config: ProjectLibraryConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!tokenMatches(config.sessionToken, req.get('X-WriterOS-Session'))) {
      return res.status(401).json({ error: 'unauthorized', message: 'Project library session is invalid.' })
    }
    next()
  }
}

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
      const ref = await dataStore(config, store).writeProject(project)
      return res.json({ ref })
    } catch (error) {
      return routeError(res, error)
    }
  })
}
