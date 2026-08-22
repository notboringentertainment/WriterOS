import type {
  ProjectLibraryBootstrap,
  ProjectLibraryListResponse,
  ProjectLibraryReadResponse,
  ProjectLibraryRemoveResponse,
  ProjectLibrarySaveResponse,
} from '@shared/projectLibraryApi'
import type { StoredProject } from './projectLibrary'
import type { ProjectStorageAdapter } from './projectStorage'

export type ServerProjectStorageRef = ProjectLibrarySaveResponse['ref']

type FetchProjectLibrary = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

interface ApiErrorBody {
  error?: unknown
  message?: unknown
}

export class ServerProjectStorageError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ServerProjectStorageError'
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ServerProjectStorageError(
      'WriterOS project library returned an invalid response.',
      response.status,
      'invalid-response',
    )
  }
}

async function requestJson<T>(
  fetchProjectLibrary: FetchProjectLibrary,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchProjectLibrary(path, {
    credentials: 'same-origin',
    ...init,
  })
  const body = await readJson(response)

  if (!response.ok) {
    const apiError = body && typeof body === 'object' ? body as ApiErrorBody : {}
    throw new ServerProjectStorageError(
      typeof apiError.message === 'string'
        ? apiError.message
        : 'WriterOS could not access the project library.',
      response.status,
      typeof apiError.error === 'string' ? apiError.error : 'request-failed',
    )
  }

  return body as T
}

function unsupported(message: string) {
  return { ok: false as const, reason: 'unsupported' as const, message }
}

export async function bootstrapServerProjectStorage(
  fetchProjectLibrary: FetchProjectLibrary = globalThis.fetch.bind(globalThis),
): Promise<ProjectStorageAdapter<ServerProjectStorageRef> | null> {
  const bootstrap = await requestJson<ProjectLibraryBootstrap>(
    fetchProjectLibrary,
    '/api/project-library/bootstrap',
    { headers: { Accept: 'application/json' } },
  )
  if (!bootstrap || bootstrap.enabled !== true) return null
  if (typeof bootstrap.label !== 'string' || typeof bootstrap.sessionToken !== 'string') {
    throw new ServerProjectStorageError(
      'WriterOS project library returned an invalid bootstrap response.',
      200,
      'invalid-response',
    )
  }

  const sessionHeaders = {
    Accept: 'application/json',
    'X-WriterOS-Session': bootstrap.sessionToken,
  }
  const projectPath = (projectId: string) =>
    `/api/project-library/projects/${encodeURIComponent(projectId)}`

  return {
    kind: 'server',
    label: bootstrap.label,
    defaultFolderLabel: bootstrap.label,
    capabilities: {
      removeProject: true,
      archiveProject: false,
      restoreProject: false,
      showProjectInFolder: false,
      duplicateProject: false,
    },
    async listProjects() {
      const response = await requestJson<ProjectLibraryListResponse>(
        fetchProjectLibrary,
        '/api/project-library/projects',
        { headers: sessionHeaders },
      )
      return response.entries
    },
    async readProject(ref) {
      const response = await requestJson<ProjectLibraryReadResponse>(
        fetchProjectLibrary,
        projectPath(ref.id),
        { headers: sessionHeaders },
      )
      return response.result
    },
    async writeProject(project: StoredProject) {
      const response = await requestJson<ProjectLibrarySaveResponse>(
        fetchProjectLibrary,
        projectPath(project.id),
        {
          method: 'PUT',
          headers: {
            ...sessionHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ project }),
        },
      )
      return response.ref
    },
    async removeProject(ref) {
      try {
        const response = await requestJson<ProjectLibraryRemoveResponse>(
          fetchProjectLibrary,
          projectPath(ref.id),
          { method: 'DELETE', headers: sessionHeaders },
        )
        return { ok: true, folderAlreadyMissing: response.alreadyMissing }
      } catch (error) {
        if (error instanceof ServerProjectStorageError && error.code === 'not-found') {
          return { ok: true, folderAlreadyMissing: true }
        }
        return {
          ok: false,
          reason: 'failed',
          message: error instanceof Error ? error.message : 'WriterOS could not delete the project.',
        }
      }
    },
    async archiveProject() {
      return unsupported('Archiving projects is not available through the server project library yet.')
    },
    async restoreProject() {
      return unsupported('Restoring projects is not available through the server project library yet.')
    },
    async showProjectInFolder() {
      return unsupported('Showing projects in Finder is not available through the server project library.')
    },
    async duplicateProject() {
      return unsupported('Duplicating projects is not available through the server project library yet.')
    },
  }
}
