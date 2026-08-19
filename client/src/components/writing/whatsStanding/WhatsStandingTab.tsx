// State discipline mirrors SynopsisTab.tsx: useBoundProjectScopeKey +
// useProjectRequestGeneration guard every request, and a ref-based
// double-submit guard for the in-flight answer. Session bootstrap mirrors
// useProjectMemory.ts's minimal fetch of /api/project-library/bootstrap —
// this tab does not carry its own persistent session hook because its only
// state is the single What's Standing payload.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createProjectMemoryApi, ProjectMemoryApiError } from '../../../lib/projectMemoryApi'
import { useBoundProjectScopeKey, useProjectRequestGeneration } from '../../../lib/useProjectRequestGeneration'
import type { WhatsStandingPayload } from '@shared/whatsStandingPanel'
import type { WhatsStandingAnswer } from './QuestionCard'
import { WhatsStandingView } from './WhatsStandingView'

export interface WhatsStandingTabProps { projectId?: string; projectScopeKey?: string }

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface ProjectLibraryBootstrapBody {
  enabled?: unknown
  sessionToken?: unknown
}

const DEFAULT_FETCH: FetchLike = (input, init) => globalThis.fetch(input, init)

async function bootstrapSessionToken(fetchImpl: FetchLike): Promise<string | null> {
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
const NO_FOLDER_MESSAGE = "What's Standing reads your project's memory package, which needs a folder-backed project."
const LOAD_FAILURE_MESSAGE = "WriterOS could not load What's Standing."
const ANSWER_FAILURE_MESSAGE = 'WriterOS could not save this answer.'

export function WhatsStandingTab({ projectId, projectScopeKey }: WhatsStandingTabProps) {
  const effectiveProjectScopeKey = useBoundProjectScopeKey(projectId, projectScopeKey)
  const beginRequest = useProjectRequestGeneration(effectiveProjectScopeKey)
  const [payload, setPayload] = useState<WhatsStandingPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const answeringRef = useRef(false)
  const sessionTokenRef = useRef<Promise<string | null> | null>(null)

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (!sessionTokenRef.current) sessionTokenRef.current = bootstrapSessionToken(DEFAULT_FETCH)
    const token = await sessionTokenRef.current
    // Do not cache a failure: a transient bootstrap failure should not
    // permanently strand the surface in "session unavailable" for the rest
    // of this scope's lifetime — the next load/answer retries it.
    if (!token) sessionTokenRef.current = null
    return token
  }, [])

  const load = useCallback(async () => {
    if (!projectId) return
    const isCurrent = beginRequest()
    setLoading(true)
    setError(null)
    try {
      const token = await getSessionToken()
      if (!isCurrent()) return
      if (!token) {
        setError(SESSION_UNAVAILABLE_MESSAGE)
        return
      }
      const api = createProjectMemoryApi(token, DEFAULT_FETCH)
      const result = await api.whatsStanding(projectId)
      if (!isCurrent()) return
      setPayload(result)
    } catch (caught) {
      if (!isCurrent()) return
      setError(caught instanceof ProjectMemoryApiError ? caught.message : LOAD_FAILURE_MESSAGE)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [projectId, beginRequest, getSessionToken])

  useEffect(() => {
    sessionTokenRef.current = null
    setPayload(null)
    setError(null)
    setNotice(null)
    setAnsweringId(null)
    answeringRef.current = false
    setLoading(false)
    if (projectId) void load()
    // Reset/reload only on scope change, mirroring SynopsisTab/useProjectMemory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProjectScopeKey])

  const handleAnswer = useCallback(async (
    annotationId: string,
    questionVersion: string,
    answer: WhatsStandingAnswer,
  ) => {
    if (answeringRef.current || !projectId) return
    const isCurrent = beginRequest()
    answeringRef.current = true
    setAnsweringId(annotationId)
    setError(null)
    // A stale 409 notice from a prior attempt must not linger past a
    // successful save on the same (or another) question, where it would
    // read as if this new save also had a problem. A fresh 409 below
    // re-sets it.
    setNotice(null)
    try {
      const token = await getSessionToken()
      if (!isCurrent()) return
      if (!token) {
        setError(SESSION_UNAVAILABLE_MESSAGE)
        return
      }
      const api = createProjectMemoryApi(token, DEFAULT_FETCH)
      const result = await api.answerWhatsStanding(projectId, annotationId, questionVersion, answer)
      if (!isCurrent()) return
      setPayload(result)
    } catch (caught) {
      if (!isCurrent()) return
      if (caught instanceof ProjectMemoryApiError && caught.statusCode === 409) {
        // The annotation moved under us — surface the server's explanation
        // and refetch the current report (through its own generation guard)
        // rather than silently retrying the stale answer.
        setNotice(caught.message)
        answeringRef.current = false
        setAnsweringId(null)
        await load()
        return
      }
      setError(caught instanceof ProjectMemoryApiError ? caught.message : ANSWER_FAILURE_MESSAGE)
    } finally {
      if (isCurrent()) {
        answeringRef.current = false
        setAnsweringId(null)
      }
    }
  }, [projectId, beginRequest, getSessionToken, load])

  const helperLine = "What's decided, what's contested, and what still points somewhere."

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: 'var(--fg)', margin: 0 }}>
          What's Standing
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', fontStyle: 'italic', margin: '4px 0 0' }}>
          {helperLine}
        </p>
      </div>

      {!projectId && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-muted)' }}>{NO_FOLDER_MESSAGE}</p>
      )}

      {projectId && loading && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-muted)' }}>Loading…</p>
      )}

      {projectId && !loading && error && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--error, #b91c1c)' }}>
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </p>
      )}

      {projectId && !loading && !error && payload && (
        <WhatsStandingView payload={payload} answeringId={answeringId} notice={notice} onAnswer={handleAnswer} />
      )}
    </div>
  )
}
