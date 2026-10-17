import { BeatSheetSyncStatusSchema } from '@shared/projectLibraryApi'
import { connectVoiceProfileLibrary } from './voiceProfile'
import type {
  BeatSheetSyncStatusResponse,
  ProjectLibraryBootstrap,
  ProjectLibraryListResponse,
  ProjectLibraryReadResponse,
  ProjectLibraryRemoveResponse,
  ProjectLibrarySaveResponse,
} from '@shared/projectLibraryApi'
import { postLookbookQuestions } from './lookbookClient'
import { getLookExport, postLookPromote } from './looksClient'
import { getBeatSheetStatus, postBeatSheetRefresh } from './beatSheetClient'
import { getStoryDriveFolders, postStoryDriveImportCanon, postStoryDriveLink } from './storyDriveLinkClient'
import type { StoredProject } from './projectLibrary'
import type { MorganScreenEvent } from '@shared/morganLive'
import type { MorganApi, ProjectStorageAdapter } from './projectStorage'

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
  const originalFetch = fetchProjectLibrary
  let refreshing: Promise<void> | null = null
  fetchProjectLibrary = async (input, init) => {
    const send = () => originalFetch(input, {
      ...init,
      headers: { ...init?.headers, 'X-WriterOS-Session': sessionHeaders['X-WriterOS-Session'] },
    })
    const response = await send()
    if (response.status !== 401) return response
    try {
      if (!refreshing) {
        refreshing = requestJson<ProjectLibraryBootstrap>(originalFetch, '/api/project-library/bootstrap', {
          headers: { Accept: 'application/json' },
        }).then(next => {
          if (!next.enabled || typeof next.sessionToken !== 'string') throw new Error()
          sessionHeaders['X-WriterOS-Session'] = next.sessionToken
        }).finally(() => { refreshing = null })
      }
      await refreshing
      const retried = await send()
      if (retried.status === 401) throw new Error()
      return retried
    } catch {
      throw new ServerProjectStorageError('Reload to keep saving', 401, 'session-expired')
    }
  }
  const projectPath = (projectId: string) =>
    `/api/project-library/projects/${encodeURIComponent(projectId)}`

  const morganBase = (id: string) => `/api/morgan/${encodeURIComponent(id)}`
  async function morganRequest(url: string, init: RequestInit): Promise<Response> {
    const response = await fetchProjectLibrary(url, {
      credentials: 'same-origin',
      ...init,
      headers: { ...sessionHeaders, 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      const body: ApiErrorBody = await response.json().catch(() => ({}))
      throw new ServerProjectStorageError(
        typeof body?.message === 'string' ? body.message : 'Morgan request failed.',
        response.status,
        typeof body?.error === 'string' ? body.error : 'request-failed',
      )
    }
    return response
  }
  const morgan: MorganApi | undefined = bootstrap.morganHost === true ? {
    start: async (id, opts) => (await morganRequest(`${morganBase(id)}/session`, {
      method: 'POST', body: JSON.stringify({ fresh: opts?.fresh === true }),
    })).json(),
    submit: async (id, text, context) => (await (await morganRequest(`${morganBase(id)}/submit`, {
      method: 'POST', body: JSON.stringify({ text, ...(context ? { context } : {}) }),
    })).json()).composerId,
    answerApproval: async (id, requestId, answer) => {
      await morganRequest(`${morganBase(id)}/approval/${encodeURIComponent(requestId)}`, { method: 'POST', body: JSON.stringify(answer) })
    },
    answerProposal: async (id, proposalId, answer) => {
      await morganRequest(`${morganBase(id)}/proposal/${encodeURIComponent(proposalId)}`, { method: 'POST', body: JSON.stringify(answer) })
    },
    stop: async (id, turnId) => { await morganRequest(`${morganBase(id)}/stop`, { method: 'POST', body: JSON.stringify({ turnId }) }) },
    end: async id => { await morganRequest(`${morganBase(id)}/session`, { method: 'DELETE' }) },
    stream: (id, onEvent, onClosed) => {
      const controller = new AbortController()
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      void (async () => {
        try {
          const response = await fetchProjectLibrary(`${morganBase(id)}/stream`, {
            credentials: 'same-origin', headers: sessionHeaders, signal: controller.signal,
          })
          if (!response.ok || !response.body) return
          reader = response.body.getReader()
          if (controller.signal.aborted) return
          const decoder = new TextDecoder()
          let buffer = '', data: string[] = []
          const consume = (text: string, final = false) => {
            buffer += text
            let cut: number
            while ((cut = buffer.search(/[\r\n]/)) >= 0) {
              // Wait for a possible LF when CR falls at the end of a chunk.
              if (!final && buffer[cut] === '\r' && cut === buffer.length - 1) break
              const line = buffer.slice(0, cut)
              const width = buffer[cut] === '\r' && buffer[cut + 1] === '\n' ? 2 : 1
              buffer = buffer.slice(cut + width)
              if (!line) {
                if (data.length && !controller.signal.aborted) onEvent(JSON.parse(data.join('\n')) as MorganScreenEvent)
                data = []
              } else if (line === 'data' || line.startsWith('data:')) {
                data.push(line === 'data' ? '' : line.slice(5).replace(/^ /, ''))
              }
              if (controller.signal.aborted) return
            }
          }
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read()
            if (controller.signal.aborted) break
            if (done) { consume(decoder.decode(), true); break }
            consume(decoder.decode(value, { stream: true }))
          }
        } catch { /* Network and malformed-stream failures close the subscription. */ }
        finally {
          if (reader) {
            await reader.cancel().catch(() => undefined)
            reader.releaseLock()
          }
          if (!controller.signal.aborted) onClosed()
        }
      })()
      return () => {
        if (controller.signal.aborted) return
        controller.abort()
        void reader?.cancel().catch(() => undefined)
      }
    },
  } : undefined

  return {
    ...(morgan ? { morgan } : {}),
    kind: 'server',
    connectVoiceProfile: () => connectVoiceProfileLibrary(fetchProjectLibrary),
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
      // A server that predates the Beat Sheet sends no beatSheet field: treat it as none.
      const rawStatus = response?.beatSheet
      const parsedStatus = rawStatus === undefined || rawStatus === null
        ? null
        : BeatSheetSyncStatusSchema.safeParse(rawStatus)
      if (!response || !response.result || (parsedStatus && !parsedStatus.success)) {
        throw new ServerProjectStorageError(
          'WriterOS project library returned an invalid response.',
          200,
          'invalid-response',
        )
      }
      const beatSheet: BeatSheetSyncStatusResponse | null = parsedStatus?.success ? parsedStatus.data : null
      return { result: response.result, beatSheet }
    },
    beatSheet: {
      refresh: projectId => postBeatSheetRefresh(projectId, sessionHeaders['X-WriterOS-Session']),
      status: projectId => getBeatSheetStatus(projectId, sessionHeaders['X-WriterOS-Session']),
    },
    storyDrive: {
      folders: () => getStoryDriveFolders(sessionHeaders['X-WriterOS-Session']),
      link: (projectId, folder) => postStoryDriveLink(projectId, folder, sessionHeaders['X-WriterOS-Session']),
      importCanon: projectId => postStoryDriveImportCanon(projectId, sessionHeaders['X-WriterOS-Session']),
    },
    lookbook: {
      questions: (projectId, beatKey) =>
        postLookbookQuestions(projectId, sessionHeaders['X-WriterOS-Session'], {
          beatKey,
          clientRequestId: `lbreq_${crypto.randomUUID()}`,
        }),
    },
    looks: {
      promote: (projectId, body) => postLookPromote(projectId, sessionHeaders['X-WriterOS-Session'], body),
      reexport: projectId => getLookExport(projectId, sessionHeaders['X-WriterOS-Session']),
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
