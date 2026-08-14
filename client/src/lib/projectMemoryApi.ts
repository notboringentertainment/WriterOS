import type {
  MemoryContextPackage,
  ProjectMemoryAction,
  ProjectMemorySnapshot,
} from '../../../shared/projectMemory'
import type { MemoryQuery } from '../../../server/projectMemory/retrieval'

type FetchProjectMemory = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

interface ProjectMemorySnapshotResponse {
  snapshot: ProjectMemorySnapshot
}

interface ProjectMemoryContextResponse {
  context: MemoryContextPackage
}

interface ApiErrorBody {
  error?: unknown
  message?: unknown
}

export class ProjectMemoryApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ProjectMemoryApiError'
  }
}

async function requestJson<T>(
  fetchProjectMemory: FetchProjectMemory,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchProjectMemory(path, { credentials: 'same-origin', ...init })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ProjectMemoryApiError(
      'WriterOS project memory returned an invalid response.',
      response.status,
      'invalid-response',
    )
  }
  if (!response.ok) {
    const apiError = body && typeof body === 'object' ? body as ApiErrorBody : {}
    throw new ProjectMemoryApiError(
      typeof apiError.message === 'string'
        ? apiError.message
        : 'WriterOS could not access project memory.',
      response.status,
      typeof apiError.error === 'string' ? apiError.error : 'request-failed',
    )
  }
  return body as T
}

export function createProjectMemoryApi(
  sessionToken: string,
  fetchProjectMemory: FetchProjectMemory = globalThis.fetch.bind(globalThis),
) {
  const headers = {
    Accept: 'application/json',
    'X-WriterOS-Session': sessionToken,
  }

  return {
    async snapshot(projectId: string): Promise<ProjectMemorySnapshot> {
      const body = await requestJson<ProjectMemorySnapshotResponse>(fetchProjectMemory,
        `/api/project-memory/${encodeURIComponent(projectId)}/snapshot`,
        { headers },
      )
      return body.snapshot
    },
    async context(projectId: string, query: MemoryQuery): Promise<MemoryContextPackage> {
      const search = new URLSearchParams({ query: query.message })
      if (query.surface !== undefined) search.set('surface', query.surface)
      if (query.personaId !== undefined) search.set('personaId', query.personaId)
      for (const entity of query.currentEntities ?? []) search.append('currentEntities', entity)
      const body = await requestJson<ProjectMemoryContextResponse>(fetchProjectMemory,
        `/api/project-memory/${encodeURIComponent(projectId)}/context?${search.toString()}`,
        { headers },
      )
      return body.context
    },
    async action(projectId: string, action: ProjectMemoryAction): Promise<ProjectMemorySnapshot> {
      const body = await requestJson<ProjectMemorySnapshotResponse>(fetchProjectMemory,
        `/api/project-memory/${encodeURIComponent(projectId)}/actions`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        },
      )
      return body.snapshot
    },
    async analyze<TAnalysis = unknown>(projectId: string, input: unknown): Promise<TAnalysis> {
      const body = await requestJson<{ analysis: TAnalysis }>(fetchProjectMemory,
        `/api/project-memory/${encodeURIComponent(projectId)}/analyze`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      return body.analysis
    },
  }
}
