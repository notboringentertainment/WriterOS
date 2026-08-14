// Project Meeting interview session state + actions, extracted from RoomChannel so the
// ritual page and the room's status line share one implementation (§A3-A12).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectDocuments } from '@shared/documents'
import type { MemoryReceipt } from '@shared/schema'
import { pitchPacketFileNames, renderPitchPacketJson, renderPitchPacketMarkdown, type PitchPacket } from '@shared/pitchPacket'
import {
  approvePitchPacket,
  answerInterviewQuestion,
  bankInterview,
  createPitchPacketDraft,
  exportPitchPacket,
  fetchExportedPitchPacket,
  fetchInterviewBankPreview,
  fetchInterviewStatus,
  pauseInterview,
  redirectInterviewArea,
  resolveRoomProposal,
  resumeInterview,
  savePitchPacketDraft,
  skipInterviewQuestion,
  startInterview,
  wrapInterview,
  type InterviewBankPreview,
  type InterviewBankFinalValues,
  type InterviewMutability,
  type InterviewQuestion,
  type InterviewSession,
  type InterviewStatus,
  type MeetingDirectionDiff,
  type MeetingRecapItem,
  type MeetingRevisionInput,
  type PitchPacketRow,
} from './roomApi'
import { downloadTextFile } from './downloadTextFile'
import { useProjectRequestGeneration } from './useProjectRequestGeneration'

export type InterviewAnswerOrigin = 'seed' | 'extrapolated'
export type { InterviewMutability }

export function emptyInterviewStatus(): InterviewStatus {
  return { activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null, recap: [], directionDiff: [], directionRevision: 0 }
}

function defaultKeepOperations(recap: readonly MeetingRecapItem[]): MeetingRevisionInput[] {
  return recap.map(item => ({ op: 'keep', targetId: item.decisionId }))
}

function operationTargets(operation: MeetingRevisionInput): string[] {
  return operation.op === 'supersede' ? operation.targetIds : [operation.targetId]
}

export interface InterviewSessionHandle {
  status: InterviewStatus
  bankPreview: InterviewBankPreview | null
  finalValues: InterviewBankFinalValues | null
  directionDiff: MeetingDirectionDiff[]
  directionRevision: number | null
  revisionOperations: MeetingRevisionInput[]
  previewPending: boolean
  pitchPacketRow: PitchPacketRow | null
  memoryReceipt: MemoryReceipt | undefined
  pitchPacketMemoryReceipt: MemoryReceipt | undefined
  proposalUnavailable: boolean
  packetMessage: string | null
  packetDownloadError: string | null
  error: string | null
  clearError: () => void
  refresh: () => Promise<void>
  prepareNewRound: () => void
  start: (input: { mode: 'quick' | 'full'; seedText: string }) => Promise<boolean>
  answer: (input: { answerText: string; origin: InterviewAnswerOrigin; rejectMapping?: boolean }) => Promise<boolean>
  skip: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  wrap: () => Promise<void>
  setRevisionOperation: (operation: MeetingRevisionInput) => MeetingRevisionInput[]
  redirect: (area: string, questionId: string) => Promise<void>
  previewBank: (mutability?: Record<string, InterviewMutability>, operations?: MeetingRevisionInput[]) => Promise<void>
  bank: (mutability?: Record<string, InterviewMutability>) => Promise<void>
  openPitchPacket: (documents: ProjectDocuments, projectTitle?: string) => Promise<void>
  savePitchPacket: (packet: PitchPacket) => Promise<void>
  approvePitchPacketReview: (packet: PitchPacket) => Promise<void>
  exportPitchPacketFiles: () => Promise<void>
  redownloadPitchPacket: () => Promise<void>
}

export function useInterviewSession(projectId: string, projectScopeKey = `memory:${projectId}`): InterviewSessionHandle {
  const [status, setStatus] = useState<InterviewStatus>(emptyInterviewStatus)
  const [bankPreview, setBankPreview] = useState<InterviewBankPreview | null>(null)
  const [finalValues, setFinalValues] = useState<InterviewBankFinalValues | null>(null)
  const [directionDiff, setDirectionDiff] = useState<MeetingDirectionDiff[]>([])
  const [directionRevision, setDirectionRevision] = useState<number | null>(null)
  const [revisionOperations, setRevisionOperations] = useState<MeetingRevisionInput[]>([])
  const [previewPending, setPreviewPending] = useState(false)
  const [pitchPacketRow, setPitchPacketRow] = useState<PitchPacketRow | null>(null)
  const [memoryReceipt, setMemoryReceipt] = useState<MemoryReceipt>()
  const [pitchPacketMemoryReceipt, setPitchPacketMemoryReceipt] = useState<MemoryReceipt>()
  const [proposalUnavailable, setProposalUnavailable] = useState(false)
  const [packetMessage, setPacketMessage] = useState<string | null>(null)
  const [packetDownloadError, setPacketDownloadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Monotonic id for preview requests: rapid mutability toggles fire overlapping
  // fetches, and only the latest response may write bankPreview.
  const previewSeqRef = useRef(0)
  const beginStatusRequest = useProjectRequestGeneration(projectScopeKey)
  const beginStartRequest = useProjectRequestGeneration(projectScopeKey)
  const beginPitchPacketRequest = useProjectRequestGeneration(projectScopeKey)

  useEffect(() => {
    const isCurrent = beginStatusRequest()
    setStatus(emptyInterviewStatus())
    setBankPreview(null)
    setFinalValues(null)
    setDirectionDiff([])
    setDirectionRevision(null)
    setRevisionOperations([])
    setPreviewPending(false)
    setPitchPacketRow(null)
    setMemoryReceipt(undefined)
    setPitchPacketMemoryReceipt(undefined)
    setProposalUnavailable(false)
    setPacketMessage(null)
    setPacketDownloadError(null)
    setError(null)
    fetchInterviewStatus(projectId)
      .then(next => {
        if (isCurrent()) {
          const normalized = { ...next, recap: next.recap ?? [] }
          setStatus(normalized)
          setRevisionOperations(defaultKeepOperations(normalized.recap))
          setDirectionDiff(normalized.directionDiff ?? [])
          setDirectionRevision(normalized.directionRevision ?? 0)
          const terminal = normalized.latestTerminalSession
          if (terminal?.state === 'exported') {
            void fetchExportedPitchPacket(projectId, terminal.id)
              .then(row => { if (isCurrent() && row) setPitchPacketRow(row) })
              .catch(() => { /* Export remains persisted; surface stays usable for a new round. */ })
          }
        }
      })
      .catch(() => {
        // Project Meeting is an explicit enhancement; callers remain usable if unavailable.
      })
  }, [beginStatusRequest, projectId, projectScopeKey])

  const clearError = useCallback(() => setError(null), [])

  const refresh = useCallback(async () => {
    const isCurrent = beginStatusRequest()
    try {
      const next = await fetchInterviewStatus(projectId)
      if (!isCurrent()) return
      const normalized = { ...next, recap: next.recap ?? [] }
      setStatus(normalized)
      setRevisionOperations(defaultKeepOperations(normalized.recap))
      setDirectionDiff(normalized.directionDiff ?? [])
      setDirectionRevision(normalized.directionRevision ?? 0)
      const terminal = normalized.latestTerminalSession
      if (terminal?.state === 'exported') {
        const row = await fetchExportedPitchPacket(projectId, terminal.id)
        if (!isCurrent()) return
        if (row) setPitchPacketRow(row)
      }
    } catch {
      // Keep the last known status; the room stays usable without the interview API.
    }
  }, [beginStatusRequest, projectId])

  const prepareNewRound = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      activeSession: prev.activeSession?.state === 'banked' || prev.activeSession?.state === 'exported' ? null : prev.activeSession,
      latestTerminalSession: null,
      currentQuestion: null,
    }))
    setPitchPacketRow(null)
    setMemoryReceipt(undefined)
    setPitchPacketMemoryReceipt(undefined)
    setProposalUnavailable(false)
    setPacketMessage(null)
    setPacketDownloadError(null)
    setError(null)
  }, [])

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
    const isCurrent = beginStartRequest()
    try {
      const result = await startInterview(projectId, input)
      if (!isCurrent()) return false
      const recap = result.recap ?? []
      setStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: result.currentQuestion, recap }))
      setRevisionOperations(defaultKeepOperations(recap))
      setDirectionDiff(result.directionDiff ?? [])
      setDirectionRevision(result.directionRevision ?? 0)
      setMemoryReceipt(result.memoryReceipt)
      return true
    } catch (err) {
      if (!isCurrent()) return false
      setError(err instanceof Error ? err.message : 'Project Meeting start failed')
      return false
    }
  }, [beginStartRequest, projectId])

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

  const setRevisionOperation = useCallback((operation: MeetingRevisionInput) => {
    const nextTargets = new Set(operationTargets(operation))
    const next = [...revisionOperations.filter(existing => !operationTargets(existing).some(target => nextTargets.has(target))), operation]
    setRevisionOperations(next)
    return next
  }, [revisionOperations])

  const redirect = useCallback(async (area: string, questionId: string) => {
    const session = status.activeSession
    if (!session) return
    try {
      setSessionResult(await redirectInterviewArea(projectId, session.id, area, questionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen that question')
    }
  }, [projectId, status.activeSession, setSessionResult])

  const previewBank = useCallback(async (mutability: Record<string, InterviewMutability> = {}, operations: MeetingRevisionInput[] = revisionOperations) => {
    const session = status.activeSession
    if (!session) return
    const seq = ++previewSeqRef.current
    setPreviewPending(true)
    setBankPreview(null)
    setFinalValues(null)
    try {
      const result = await fetchInterviewBankPreview(projectId, session.id, mutability, operations)
      if (seq === previewSeqRef.current) {
        setBankPreview(result.preview)
        setFinalValues(result.finalValues)
        setDirectionDiff(result.directionDiff ?? [])
        setDirectionRevision(result.directionRevision ?? null)
        setPreviewPending(false)
      }
    } catch (err) {
      if (seq === previewSeqRef.current) {
        setBankPreview(null)
        setFinalValues(null)
        setDirectionDiff([])
        setDirectionRevision(null)
        setPreviewPending(false)
        setError(err instanceof Error ? err.message : 'Bank preview failed')
      }
    }
  }, [projectId, revisionOperations, status.activeSession])

  const bank = useCallback(async (mutability: Record<string, InterviewMutability> = {}) => {
    const session = status.activeSession
    if (!session) return
    try {
      const result = await bankInterview(projectId, session.id, mutability, revisionOperations)
      // The banked preview is authoritative; invalidate any preview still in flight.
      previewSeqRef.current++
      setStatus(prev => ({ ...prev, activeSession: result.session, hasBankedSeed: true, actionLabel: 'New interview round' }))
      setBankPreview(result.preview)
      setFinalValues(null)
      setDirectionDiff([])
      setPreviewPending(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank failed')
    }
  }, [projectId, revisionOperations, status.activeSession])

  const openPitchPacket = useCallback(async (documents: ProjectDocuments, projectTitle?: string) => {
    const session = status.activeSession ?? status.latestTerminalSession
    if (!session) return
    const isCurrent = beginPitchPacketRequest()
    try {
      const result = await createPitchPacketDraft(projectId, session.id, documents, { title: projectTitle })
      if (!isCurrent()) return
      setPitchPacketMemoryReceipt(result.memoryReceipt)
      setPitchPacketRow(result.memoryReceipt && !result.row.memory_receipt
        ? { ...result.row, memory_receipt: result.memoryReceipt }
        : result.row)
      setProposalUnavailable(result.proposalUnavailable)
      setPacketMessage(null)
      setPacketDownloadError(null)
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Pitch Packet draft failed')
    }
  }, [beginPitchPacketRequest, projectId, status.activeSession, status.latestTerminalSession])

  const savePitchPacket = useCallback(async (packet: PitchPacket) => {
    if (!pitchPacketRow) return
    const isCurrent = beginPitchPacketRequest()
    try {
      const saved = await savePitchPacketDraft(projectId, pitchPacketRow.session_id, pitchPacketRow.id, packet)
      if (!isCurrent()) return
      setPitchPacketRow(saved)
      setPacketMessage('Pitch Packet draft saved.')
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Pitch Packet save failed')
    }
  }, [beginPitchPacketRequest, pitchPacketRow, projectId])

  const approvePitchPacketReview = useCallback(async (packet: PitchPacket) => {
    if (!pitchPacketRow) return
    const isCurrent = beginPitchPacketRequest()
    try {
      const saved = await savePitchPacketDraft(projectId, pitchPacketRow.session_id, pitchPacketRow.id, packet)
      if (!isCurrent()) return
      const approved = await approvePitchPacket(projectId, saved.session_id, saved.id)
      if (!isCurrent()) return
      setPitchPacketRow(approved)
      setPacketMessage('Pitch Packet approved. It is ready to export.')
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Pitch Packet approval failed')
    }
  }, [beginPitchPacketRequest, pitchPacketRow, projectId])

  const downloadPacket = useCallback((row: PitchPacketRow) => {
    const filenames = pitchPacketFileNames(row.packet)
    downloadTextFile(filenames.markdown, renderPitchPacketMarkdown(row.packet), 'text/markdown')
    downloadTextFile(filenames.json, renderPitchPacketJson(row.packet), 'application/json')
  }, [])

  const exportPitchPacketFiles = useCallback(async () => {
    if (!pitchPacketRow) return
    const isCurrent = beginPitchPacketRequest()
    let exported: PitchPacketRow
    try {
      // The persisted export transaction completes before either browser download starts.
      exported = await exportPitchPacket(projectId, pitchPacketRow.session_id, pitchPacketRow.id)
      if (!isCurrent()) return
      setPitchPacketRow(exported)
      setPacketMessage(null)
      setPacketDownloadError(null)
    } catch (err) {
      if (!isCurrent()) return
      setError(err instanceof Error ? err.message : 'Pitch Packet export failed')
      return
    }
    try {
      if (!isCurrent()) return
      downloadPacket(exported)
      setPacketMessage('Pitch Packet exported. Two files downloaded: Markdown and JSON.')
    } catch (err) {
      if (!isCurrent()) return
      setPacketDownloadError(err instanceof Error ? err.message : 'The packet was exported, but the files could not be downloaded.')
    }
  }, [beginPitchPacketRequest, downloadPacket, pitchPacketRow, projectId])

  const redownloadPitchPacket = useCallback(async () => {
    if (!pitchPacketRow) return
    const isCurrent = beginPitchPacketRequest()
    try {
      const exported = await fetchExportedPitchPacket(projectId, pitchPacketRow.session_id)
      if (!isCurrent()) return
      if (!exported) throw new Error('No exported Pitch Packet was found.')
      setPitchPacketRow(exported)
      downloadPacket(exported)
      setPacketDownloadError(null)
      setPacketMessage('Pitch Packet downloaded again: Markdown and JSON.')
    } catch (err) {
      if (!isCurrent()) return
      setPacketDownloadError(err instanceof Error ? err.message : 'Pitch Packet download failed')
    }
  }, [beginPitchPacketRequest, downloadPacket, pitchPacketRow, projectId])

  return {
    status,
    bankPreview,
    finalValues,
    directionDiff,
    directionRevision,
    revisionOperations,
    previewPending,
    pitchPacketRow,
    memoryReceipt,
    pitchPacketMemoryReceipt,
    proposalUnavailable,
    packetMessage,
    packetDownloadError,
    error,
    clearError,
    refresh,
    prepareNewRound,
    start,
    answer,
    skip,
    pause,
    resume,
    wrap,
    setRevisionOperation,
    redirect,
    previewBank,
    bank,
    openPitchPacket,
    savePitchPacket,
    approvePitchPacketReview,
    exportPitchPacketFiles,
    redownloadPitchPacket,
  }
}
