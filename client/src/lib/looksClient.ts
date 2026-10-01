import {
  LookExportResponseSchema,
  LookPromoteResponseSchema,
  type LookExportResponse,
  type LookPromoteRequest,
  type LookPromoteResponse,
} from '@shared/looks'
import type { LookSpecProblem } from '@shared/lookSpec'

// Client for POST /api/looks/:projectId/promote and GET /api/looks/:projectId/export.
// A refusal is returned, not thrown, so the panel can show its plain sentences.

export type LookPromoteOutcome =
  | { ok: true; response: LookPromoteResponse }
  | { ok: false; status: number; error: string; message: string; problems: LookSpecProblem[] }

/** Thrown only when the request never got an answer (network, server down): the click may be retried as-is. */
export class LookRequestUnanswered extends Error {}

function headers(sessionToken: string): Record<string, string> {
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-WriterOS-Session': sessionToken }
}

export async function postLookPromote(projectId: string, sessionToken: string, body: LookPromoteRequest): Promise<LookPromoteOutcome> {
  let res: Response
  try {
    res = await fetch(`/api/looks/${encodeURIComponent(projectId)}/promote`, {
      method: 'POST', credentials: 'same-origin', headers: headers(sessionToken), body: JSON.stringify(body),
    })
  } catch (error) {
    throw new LookRequestUnanswered(error instanceof Error ? error.message : 'The server did not answer.')
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    if (res.status >= 500) throw new LookRequestUnanswered(`The server failed (${res.status}).`)
    json = {}
  }
  if (res.ok) return { ok: true, response: LookPromoteResponseSchema.parse(json) }
  if (res.status >= 500) throw new LookRequestUnanswered(`The server failed (${res.status}).`)
  const body2 = (json ?? {}) as { error?: unknown; message?: unknown; problems?: unknown }
  return {
    ok: false,
    status: res.status,
    error: typeof body2.error === 'string' ? body2.error : 'look-failed',
    message: typeof body2.message === 'string' ? body2.message : `Promote failed (${res.status}).`,
    problems: Array.isArray(body2.problems)
      ? body2.problems.filter((p): p is LookSpecProblem => !!p && typeof p === 'object' && typeof (p as LookSpecProblem).message === 'string')
      : [],
  }
}

export async function getLookExport(projectId: string, sessionToken: string): Promise<LookExportResponse> {
  const res = await fetch(`/api/looks/${encodeURIComponent(projectId)}/export`, {
    method: 'GET', credentials: 'same-origin', headers: headers(sessionToken),
  })
  if (!res.ok) throw new Error(`Re-export failed (${res.status}).`)
  return LookExportResponseSchema.parse(await res.json())
}
