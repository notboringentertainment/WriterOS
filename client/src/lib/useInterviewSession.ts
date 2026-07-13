// Project Meeting interview session state + actions, extracted from RoomChannel so the
// ritual page and the room's status line share one implementation (§A3-A12).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  answerInterviewQuestion,
  bankInterview,
  exportInterview,
  fetchInterviewBankPreview,
  fetchInterviewStatus,
  pauseInterview,
  resolveRoomProposal,
  resumeInterview,
  skipInterviewQuestion,
  startInterview,
  wrapInterview,
  type InterviewBankPreview,
  type InterviewMutability,
  type InterviewQuestion,
  type InterviewSession,
  type InterviewStatus,
} from './roomApi'

export type InterviewAnswerOrigin = 'seed' | 'extrapolated'
export type { InterviewMutability }

export function emptyInterviewStatus(): InterviewStatus {
  return { activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null }
}

export interface InterviewSessionHandle {
  status: InterviewStatus
  bankPreview: InterviewBankPreview | null
  exportMarkdown: string
  error: string | null
  clearError: () => void
  refresh: () => Promise<void>
  start: (input: { mode: 'quick' | 'full'; seedText: string }) => Promise<boolean>
  answer: (input: { answerText: string; origin: InterviewAnswerOrigin; rejectMapping?: boolean }) => Promise<boolean>
  skip: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  wrap: () => Promise<void>
  previewBank: (mutability?: Record<string, InterviewMutability>) => Promise<void>
  bank: (mutability?: Record<string, InterviewMutability>) => Promise<void>
  exportToPitchStudio: () => Promise<void>
}

export function useInterviewSession(projectId: string): InterviewSessionHandle {
  const [status, setStatus] = useState<InterviewStatus>(emptyInterviewStatus)
  const [bankPreview, setBankPreview] = useState<InterviewBankPreview | null>(null)
  const [exportMarkdown, setExportMarkdown] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Monotonic id for preview requests: rapid mutability toggles fire overlapping
  // fetches, and only the latest response may write bankPreview.
  const previewSeqRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setStatus(emptyInterviewStatus())
    setBankPreview(null)
    setExportMarkdown('')
    setError(null)
    fetchInterviewStatus(projectId)
      .then(next => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {
        // Project Meeting is an explicit enhancement; callers remain usable if unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const clearError = useCallback(() => setError(null), [])

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchInterviewStatus(projectId))
    } catch {
      // Keep the last known status; the room stays usable without the interview API.
    }
  }, [projectId])

  const setSessionResult = useCallback((result: { session: InterviewSession; currentQuestion?: InterviewQuestion | null }) => {
    // An explicit null clears the question (e.g. the lane ran dry); only an ABSENT
    // field keeps the previous one. `??` would conflate the two and pin a stale question.
    setStatus(prev => ({
      ...prev,
      activeSession: result.session,
      currentQuestion: result.currentQuestion !== undefined ? result.currentQuestion : prev.currentQuestion,
    }))
  }, [])

  const start = useCallback(async (input: { mode: 'quick' | 'full'; seedText: string }) => {
    try {
      const result = await startInterview(projectId, input)
      setStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: result.currentQuestion }))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting start failed')
      return false
    }
  }, [projectId])

  const answer = useCallback(async (input: { answerText: string; origin: InterviewAnswerOrigin; rejectMapping?: boolean }) => {
    const session = status.activeSession
    const answerText = input.answerText
    if (!session || !answerText.trim()) return false
    const rejectMapping = input.rejectMapping ?? false
    let result: Awaited<ReturnType<typeof answerInterviewQuestion>>
    try {
      result = await answerInterviewQuestion(projectId, session.id, { answerText, origin: input.origin, rejectMapping })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting answer failed')
      return false
    }
    // The answer is recorded and the session advanced server-side — reflect that
    // locally BEFORE the follow-up proposal adoption, so an adoption failure can't
    // strand the UI on a question that was already answered.
    setSessionResult(result)
    if (result.proposal && !rejectMapping) {
      try {
        await resolveRoomProposal(projectId, result.proposal.id, 'adopted', { resolvedValue: answerText, origin: input.origin })
      } catch (err) {
        setError(err instanceof Error
          ? `Answer recorded, but adopting the mapping failed: ${err.message}`
          : 'Answer recorded, but adopting the mapping failed.')
      }
    }
    return true
  }, [projectId, status.activeSession, setSessionResult])

  const skip = useCallback(async () => {
    const session = status.activeSession
    if (!session) return
    try {
      setSessionResult(await skipInterviewQuestion(projectId, session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting skip failed')
    }
  }, [projectId, status.activeSession, setSessionResult])

  const pause = useCallback(async () => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await pauseInterview(projectId, session.id)
      setStatus(prev => ({ ...prev, activeSession: result.session }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting pause failed')
    }
  }, [projectId, status.activeSession])

  const resume = useCallback(async () => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await resumeInterview(projectId, session.id)
      setStatus(prev => ({ ...prev, activeSession: result.session }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting resume failed')
    }
  }, [projectId, status.activeSession])

  const wrap = useCallback(async () => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await wrapInterview(projectId, session.id)
      setStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: null }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Project Meeting wrap failed')
    }
  }, [projectId, status.activeSession])

  const previewBank = useCallback(async (mutability: Record<string, InterviewMutability> = {}) => {
    const session = status.activeSession
    if (!session) return
    const seq = ++previewSeqRef.current
    try {
      const preview = await fetchInterviewBankPreview(projectId, session.id, mutability)
      if (seq === previewSeqRef.current) setBankPreview(preview)
    } catch (err) {
      if (seq === previewSeqRef.current) setError(err instanceof Error ? err.message : 'Bank preview failed')
    }
  }, [projectId, status.activeSession])

  const bank = useCallback(async (mutability: Record<string, InterviewMutability> = {}) => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await bankInterview(projectId, session.id, mutability)
      // The banked preview is authoritative; invalidate any preview still in flight.
      previewSeqRef.current++
      setStatus(prev => ({ ...prev, activeSession: result.session, hasBankedSeed: true, actionLabel: 'New interview round' }))
      setBankPreview(result.preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank failed')
    }
  }, [projectId, status.activeSession])

  const exportToPitchStudio = useCallback(async () => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await exportInterview(projectId, session.id)
      setStatus(prev => ({ ...prev, activeSession: result.session }))
      setExportMarkdown(result.markdown)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }, [projectId, status.activeSession])

  return {
    status,
    bankPreview,
    exportMarkdown,
    error,
    clearError,
    refresh,
    start,
    answer,
    skip,
    pause,
    resume,
    wrap,
    previewBank,
    bank,
    exportToPitchStudio,
  }
}
