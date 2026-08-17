// Client hook for the WriterOS Memory surface and inline conflict banners
// (Task 9). Wraps client/src/lib/projectMemoryApi.ts (Task 5) with the same
// scope-generation guarding used by Room/Meeting/document-tab hooks
// (useProjectRequestGeneration.ts), plus the small additional
// analysis-queue/retry surface this task needs that Task 5's client did not
// expose. `projectId` must be the server-backed project id (WriterOS
// project library, WRITEROS_PROJECTS_ROOT) — a project that only lives in
// browser storage, including a browser File System Access folder project,
// has nowhere durable (server-side) to keep a memory ledger, so this hook
// reports `browserOnly` instead of ever attempting a fetch.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectMemoryAction, ProjectMemorySnapshot } from '@shared/projectMemory'
import { createProjectMemoryApi, ProjectMemoryApiError } from './projectMemoryApi'
import { useBoundProjectScopeKey, useProjectRequestGeneration, useProjectScopeCurrent } from './useProjectRequestGeneration'

export const BROWSER_ONLY_MEMORY_MESSAGE = 'Shared project memory requires project folder storage.'

/** Lean wire shape for a pending/failed WriterOS analysis item — never carries
 * the underlying document text the server keeps for re-analysis. */
export interface MemoryAnalysisQueueEntry {
  id: string
  surface: string
  sourceUri: string
  status: 'pending' | 'failed'
  error?: string
  createdAt: string
  updatedAt: string
}

export type ProjectMemoryActionResult =
  | { ok: true }
  | { ok: false; conflict: boolean; message: string }

export type RetryAnalysisResult =
  | { ok: true }
  | { ok: false; message: string }

export interface UseProjectMemoryResult {
  /** True when there is no folder-backed project id to attach memory to. */
  browserOnly: boolean
  browserOnlyMessage: string
  loading: boolean
  /** Set only for a genuine snapshot failure — never for an analysis-queue
   * failure alone, so a transient queue hiccup never blanks the rest of the
   * surface (records/views render from a successfully loaded snapshot
   * regardless of queue state). */
  error: string | null
  snapshot: ProjectMemorySnapshot | undefined
  analysisQueue: MemoryAnalysisQueueEntry[]
  /** Set when the analysis-queue fetch itself failed (isolated from
   * `error`/`snapshot`) so the pending-analysis section can show its own
   * inline notice and section-level retry without disturbing the rest of
   * the surface. */
  analysisQueueError: string | null
  refresh: () => Promise<void>
  /** Re-fetches only the analysis queue — the section-level retry for
   * `analysisQueueError`, without re-fetching (or disturbing) the snapshot. */
  refreshAnalysisQueue: () => Promise<void>
  runAction: (action: ProjectMemoryAction) => Promise<ProjectMemoryActionResult>
  retryAnalysis: (itemId: string) => Promise<RetryAnalysisResult>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface ProjectLibraryBootstrapBody {
  enabled?: unknown
  sessionToken?: unknown
}

async function bootstrapMemorySessionToken(fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await fetchImpl('/api/project-library/bootstrap', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json() as ProjectLibraryBootstrapBody
    return body.enabled === true && typeof body.sessionToken === 'string' ? body.sessionToken : null
  } catch {
    return null
  }
}

const SESSION_UNAVAILABLE_MESSAGE = 'WriterOS could not verify this session for project memory. Check that the server project library is enabled (WRITEROS_PROJECTS_ROOT) and reload.'

// A stable module-level identity (unlike `globalThis.fetch.bind(globalThis)`
// evaluated fresh as a default-parameter expression on every call), while
// still resolving `globalThis.fetch` at call time rather than binding it
// early — so a test's `vi.stubGlobal('fetch', ...)` is still honored. This
// keeps every callback derived from `fetchImpl` (getSessionToken, load/
// refresh, runAction, retryAnalysis) referentially stable across re-renders
// when the caller omits the argument, which App.tsx's single lifted
// `useProjectMemory` instance relies on to avoid effects re-firing on every
// render.
const DEFAULT_FETCH: FetchLike = (input, init) => globalThis.fetch(input, init)

export function useProjectMemory(
  projectId: string | undefined,
  projectScopeKey?: string,
  fetchImpl: FetchLike = DEFAULT_FETCH,
): UseProjectMemoryResult {
  const effectiveScopeKey = useBoundProjectScopeKey(projectId, projectScopeKey)
  const beginRequest = useProjectRequestGeneration(effectiveScopeKey)
  const scopeIsCurrent = useProjectScopeCurrent(effectiveScopeKey)
  const [snapshot, setSnapshot] = useState<ProjectMemorySnapshot>()
  const [analysisQueue, setAnalysisQueue] = useState<MemoryAnalysisQueueEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisQueueError, setAnalysisQueueError] = useState<string | null>(null)
  const sessionTokenRef = useRef<Promise<string | null> | null>(null)

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = bootstrapMemorySessionToken(fetchImpl)
    }
    const token = await sessionTokenRef.current
    // Do not cache a failure: a transient bootstrap failure should not
    // permanently strand the surface in the "session unavailable" state for
    // the rest of this scope's lifetime — the next action/refresh retries it.
    if (!token) sessionTokenRef.current = null
    return token
  }, [fetchImpl])

  const memoryPath = useCallback(
    (id: string, suffix: string) => `/api/project-memory/${encodeURIComponent(id)}/${suffix}`,
    [],
  )

  const fetchAnalysisQueue = useCallback(async (id: string, token: string): Promise<MemoryAnalysisQueueEntry[]> => {
    const response = await fetchImpl(memoryPath(id, 'analysis-queue'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-WriterOS-Session': token },
    })
    if (!response.ok) throw new Error('WriterOS could not load pending analysis.')
    const body = await response.json() as { items?: unknown }
    return Array.isArray(body.items) ? body.items as MemoryAnalysisQueueEntry[] : []
  }, [fetchImpl, memoryPath])

  // Never throws — a queue failure is reported through the return value so
  // it can never reject the `Promise.all` in `load()` alongside the
  // snapshot fetch (that coupling used to mean one transient queue failure
  // discarded a perfectly good snapshot and blanked the whole surface).
  const fetchAnalysisQueueSafely = useCallback(async (
    id: string,
    token: string,
  ): Promise<{ ok: true; queue: MemoryAnalysisQueueEntry[] } | { ok: false; message: string }> => {
    try {
      return { ok: true, queue: await fetchAnalysisQueue(id, token) }
    } catch (caught) {
      return { ok: false, message: caught instanceof Error ? caught.message : 'WriterOS could not load pending analysis.' }
    }
  }, [fetchAnalysisQueue])

  const load = useCallback(async () => {
    if (!projectId) return
    const requestIsCurrent = beginRequest()
    setLoading(true)
    setError(null)
    setAnalysisQueueError(null)
    try {
      const token = await getSessionToken()
      if (!requestIsCurrent()) return
      if (!token) {
        setError(SESSION_UNAVAILABLE_MESSAGE)
        return
      }
      const api = createProjectMemoryApi(token, fetchImpl)
      // Independent fetches: a snapshot failure still throws (caught below,
      // as before — that is a genuine full-surface failure), but a queue
      // failure never does, so it can never take the snapshot down with it.
      const [nextSnapshot, queueResult] = await Promise.all([
        api.snapshot(projectId),
        fetchAnalysisQueueSafely(projectId, token),
      ])
      if (!requestIsCurrent()) return
      setSnapshot(nextSnapshot)
      if (queueResult.ok) {
        setAnalysisQueue(queueResult.queue)
        setAnalysisQueueError(null)
      } else {
        // Leave any previously loaded queue items in place rather than
        // wiping them — this is a fetch hiccup, not evidence the queue is
        // now empty.
        setAnalysisQueueError(queueResult.message)
      }
    } catch (caught) {
      if (!requestIsCurrent()) return
      setError(caught instanceof ProjectMemoryApiError ? caught.message : 'WriterOS could not load project memory.')
    } finally {
      if (requestIsCurrent()) setLoading(false)
    }
  }, [projectId, beginRequest, getSessionToken, fetchImpl, fetchAnalysisQueueSafely])

  // The pending-analysis section's own retry affordance for
  // `analysisQueueError` — refetches only the queue, leaving the snapshot
  // (and the rest of the surface) untouched.
  const refreshAnalysisQueue = useCallback(async () => {
    if (!projectId) return
    const token = await getSessionToken()
    // Scope-guarded (not generation-guarded, which would invalidate a
    // concurrent load()): a retry result that lands after a project switch
    // must never write the old project's queue state into the new scope.
    if (!scopeIsCurrent()) return
    if (!token) {
      setAnalysisQueueError(SESSION_UNAVAILABLE_MESSAGE)
      return
    }
    const result = await fetchAnalysisQueueSafely(projectId, token)
    if (!scopeIsCurrent()) return
    if (result.ok) {
      setAnalysisQueue(result.queue)
      setAnalysisQueueError(null)
    } else {
      setAnalysisQueueError(result.message)
    }
  }, [projectId, getSessionToken, fetchAnalysisQueueSafely, scopeIsCurrent])

  useEffect(() => {
    sessionTokenRef.current = null
    setSnapshot(undefined)
    setAnalysisQueue([])
    setError(null)
    setAnalysisQueueError(null)
    setLoading(false)
    if (projectId) void load()
    // Reset/reload only on scope change, mirroring OutlineTab/SynopsisTab's
    // MemoryReceipt reset-on-scope-change effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScopeKey])

  const runAction = useCallback(async (action: ProjectMemoryAction): Promise<ProjectMemoryActionResult> => {
    if (!projectId) return { ok: false, conflict: false, message: BROWSER_ONLY_MEMORY_MESSAGE }
    try {
      const token = await getSessionToken()
      if (!token) return { ok: false, conflict: false, message: SESSION_UNAVAILABLE_MESSAGE }
      const api = createProjectMemoryApi(token, fetchImpl)
      const nextSnapshot = await api.action(projectId, action)
      setSnapshot(nextSnapshot)
      return { ok: true }
    } catch (caught) {
      if (caught instanceof ProjectMemoryApiError && caught.statusCode === 409) {
        // Revision moved under us — refresh and re-present rather than
        // silently retrying the same action against stale state.
        await load()
        return {
          ok: false,
          conflict: true,
          message: 'Project memory changed since this loaded. Refreshed — review and try again.',
        }
      }
      return {
        ok: false,
        conflict: false,
        message: caught instanceof ProjectMemoryApiError ? caught.message : 'WriterOS could not update project memory.',
      }
    }
  }, [projectId, getSessionToken, fetchImpl, load])

  const retryAnalysis = useCallback(async (itemId: string): Promise<RetryAnalysisResult> => {
    if (!projectId) return { ok: false, message: BROWSER_ONLY_MEMORY_MESSAGE }
    try {
      const token = await getSessionToken()
      if (!token) return { ok: false, message: SESSION_UNAVAILABLE_MESSAGE }
      const response = await fetchImpl(memoryPath(projectId, `analysis-queue/${encodeURIComponent(itemId)}/retry`), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-WriterOS-Session': token },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: unknown }
        return {
          ok: false,
          message: typeof body.message === 'string' ? body.message : 'WriterOS could not retry this analysis.',
        }
      }
      await load()
      return { ok: true }
    } catch {
      return { ok: false, message: 'WriterOS could not retry this analysis.' }
    }
  }, [projectId, getSessionToken, fetchImpl, memoryPath, load])

  return {
    browserOnly: !projectId,
    browserOnlyMessage: BROWSER_ONLY_MEMORY_MESSAGE,
    loading,
    error,
    snapshot,
    analysisQueue,
    analysisQueueError,
    refresh: load,
    refreshAnalysisQueue,
    runAction,
    retryAnalysis,
  }
}
