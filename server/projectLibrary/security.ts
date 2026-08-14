import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { ProjectLibraryConfig } from './config'

function requestIsSameOrigin(req: Request, config: ProjectLibraryConfig): boolean {
  const origin = req.get('Origin')
  if (origin && config.allowedOrigins.has(origin)) return true

  const fetchSite = req.get('Sec-Fetch-Site')
  const host = req.get('Host')
  if (fetchSite !== 'same-origin' || !host) return false
  return [...config.allowedOrigins].some(allowedOrigin => new URL(allowedOrigin).host === host)
}

export function tokenMatches(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

export function sameOrigin(config: ProjectLibraryConfig, resource = 'Project library') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requestIsSameOrigin(req, config)) {
      return res.status(403).json({ error: 'forbidden', message: `${resource} request origin is not allowed.` })
    }
    next()
  }
}

export function authenticated(config: ProjectLibraryConfig, resource = 'Project library') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!tokenMatches(config.sessionToken, req.get('X-WriterOS-Session'))) {
      return res.status(401).json({ error: 'unauthorized', message: `${resource} session is invalid.` })
    }
    next()
  }
}
