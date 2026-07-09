// Voice Profile assessment/synthesis flow, extracted from VoiceProfileDrawer so the
// ritual page and the drawer share one implementation over the same localStorage state.

import { useCallback, useState } from 'react'
import type { VoiceProfileDocument, VoiceProfileState } from '@shared/voiceProfile'
import { loadVoiceProfileState, saveVoiceProfileState } from './voiceProfile'
import { cleanAssessmentAnswers, countAnsweredAssessmentQuestions } from './voiceProfileAssessment'

export function buildDraftAssessmentState(
  answers: Record<string, string>,
  existingState: VoiceProfileState | undefined
): VoiceProfileState {
  const now = new Date().toISOString()
  return {
    version: 1,
    status: 'draft_answers',
    answers: cleanAssessmentAnswers(answers),
    createdAt: existingState?.createdAt ?? now,
    updatedAt: now,
    ...(existingState?.deepDiveAnswers ? { deepDiveAnswers: existingState.deepDiveAnswers } : {}),
    ...(existingState?.refinementAnswers ? { refinementAnswers: existingState.refinementAnswers } : {}),
  }
}

export interface VoiceProfileFlowHandle {
  profileState: VoiceProfileState | undefined
  answers: Record<string, string>
  answeredCount: number
  synthesisLoading: boolean
  synthesisError: string | undefined
  /** Re-read localStorage; returns the loaded state so callers can derive a mode synchronously. */
  reload: () => VoiceProfileState | undefined
  /** Record one answer and autosave the draft. */
  setAnswer: (questionId: string, value: string) => void
  /** Persist the current answers as a draft. */
  saveDraftAnswers: () => void
  /** Synthesize a draft profile from the answers. Resolves true on success. */
  generateProfile: () => Promise<boolean>
  /** Promote the draft profile to complete. */
  approveProfile: () => void
  /** Record an explicit first-run skip (only when nothing exists yet). */
  markSkipped: () => void
  /** Adopt an externally persisted state (drawer edit/clear keep this the single source). */
  applyState: (state: VoiceProfileState | undefined) => void
}

export function useVoiceProfileFlow(): VoiceProfileFlowHandle {
  const [profileState, setProfileState] = useState<VoiceProfileState | undefined>(undefined)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const [synthesisError, setSynthesisError] = useState<string | undefined>(undefined)

  const reload = useCallback(() => {
    const loaded = loadVoiceProfileState()
    setProfileState(loaded)
    setAnswers(loaded?.answers ?? {})
    setSynthesisLoading(false)
    setSynthesisError(undefined)
    return loaded
  }, [])

  const applyState = useCallback((state: VoiceProfileState | undefined) => {
    setProfileState(state)
    setAnswers(state?.answers ?? {})
  }, [])

  // State writes happen eagerly (not inside setState updaters): an updater queued in
  // the same event as an unmount is never invoked, which would silently drop the save.
  const setAnswer = useCallback((questionId: string, value: string) => {
    setSynthesisError(undefined)
    const nextAnswers = { ...answers, [questionId]: value }
    const updatedState = buildDraftAssessmentState(nextAnswers, profileState)
    saveVoiceProfileState(updatedState)
    setAnswers(nextAnswers)
    setProfileState(updatedState)
  }, [answers, profileState])

  const saveDraftAnswers = useCallback(() => {
    const updatedState = buildDraftAssessmentState(answers, profileState)
    saveVoiceProfileState(updatedState)
    setProfileState(updatedState)
  }, [answers, profileState])

  const generateProfile = useCallback(async () => {
    setSynthesisLoading(true)
    setSynthesisError(undefined)
    try {
      const cleanedAnswers = cleanAssessmentAnswers(answers)
      const response = await fetch('/api/voice-profile/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: cleanedAnswers }),
      })
      if (!response.ok) {
        const errorData = await response.json() as { message?: string }
        setSynthesisError(errorData.message ?? 'Synthesis failed. Please try again.')
        return false
      }
      const data = await response.json() as { profile: VoiceProfileDocument }
      const now = new Date().toISOString()
      const newState: VoiceProfileState = {
        version: 1,
        status: 'draft_profile',
        answers: cleanedAnswers,
        profile: data.profile,
        createdAt: profileState?.createdAt ?? now,
        updatedAt: now,
        ...(profileState?.deepDiveAnswers ? { deepDiveAnswers: profileState.deepDiveAnswers } : {}),
        ...(profileState?.refinementAnswers ? { refinementAnswers: profileState.refinementAnswers } : {}),
      }
      saveVoiceProfileState(newState)
      setProfileState(newState)
      return true
    } catch {
      setSynthesisError('Network error. Please try again.')
      return false
    } finally {
      setSynthesisLoading(false)
    }
  }, [answers, profileState])

  const approveProfile = useCallback(() => {
    if (!profileState?.profile) return
    const updatedState: VoiceProfileState = {
      ...profileState,
      status: 'complete',
      updatedAt: new Date().toISOString(),
    }
    saveVoiceProfileState(updatedState)
    setProfileState(updatedState)
  }, [profileState])

  const markSkipped = useCallback(() => {
    // Only a true first-run skip is recorded; never clobber existing progress.
    if (profileState || loadVoiceProfileState()) return
    const now = new Date().toISOString()
    const skipped: VoiceProfileState = {
      version: 1,
      status: 'skipped',
      answers: {},
      createdAt: now,
      updatedAt: now,
      skippedAt: now,
    }
    saveVoiceProfileState(skipped)
    setProfileState(skipped)
  }, [profileState])

  return {
    profileState,
    answers,
    answeredCount: countAnsweredAssessmentQuestions(answers),
    synthesisLoading,
    synthesisError,
    reload,
    setAnswer,
    saveDraftAnswers,
    generateProfile,
    approveProfile,
    markSkipped,
    applyState,
  }
}
