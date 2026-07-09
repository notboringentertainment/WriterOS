import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    answerInterviewQuestion: vi.fn(),
    bankInterview: vi.fn(),
    exportInterview: vi.fn(),
    fetchInterviewBankPreview: vi.fn(),
    fetchInterviewStatus: vi.fn(),
    pauseInterview: vi.fn(),
    resolveRoomProposal: vi.fn(),
    resumeInterview: vi.fn(),
    skipInterviewQuestion: vi.fn(),
    startInterview: vi.fn(),
    wrapInterview: vi.fn(),
  },
}))
vi.mock('../../client/src/lib/roomApi', () => apiMock)

import { useInterviewSession } from '../../client/src/lib/useInterviewSession'
import type { InterviewSession } from '../../client/src/lib/roomApi'

function session(state: InterviewSession['state']): InterviewSession {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state,
    seed_text: 'A grieving chef returns home.',
    audit: { locks: 'THIN' },
    cursor: { lane: state === 'interviewing' ? 'morgan' : null, question_id: state === 'interviewing' ? 'morgan-locks' : null, budgets_spent: {} },
    answers: [],
    created_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
  }
}

const question = {
  id: 'morgan-locks',
  lane: 'morgan',
  trigger: 'locks THIN',
  question: 'What must stay true no matter what?',
  writerOSTarget: 'story_locks',
  templateDestination: 'Locks',
  originOnConfirm: 'seed',
  requirement: 'locks',
  budget: 2,
}

beforeEach(() => {
  Object.values(apiMock).forEach(mock => mock.mockReset())
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
})

describe('useInterviewSession', () => {
  it('loads interview status on mount', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('paused'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('paused'))
    expect(apiMock.fetchInterviewStatus).toHaveBeenCalledWith('p1')
  })

  it('start begins a session and surfaces the first question', async () => {
    apiMock.startInterview.mockResolvedValue({ session: session('interviewing'), currentQuestion: question })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalled())

    let ok = false
    await act(async () => {
      ok = await result.current.start({ mode: 'full', seedText: 'A grieving chef returns home.' })
    })
    expect(ok).toBe(true)
    expect(apiMock.startInterview).toHaveBeenCalledWith('p1', { mode: 'full', seedText: 'A grieving chef returns home.' })
    expect(result.current.status.currentQuestion?.id).toBe('morgan-locks')
  })

  it('answer adopts the confirmed proposal server-first', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: question })
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: null, proposal: { id: 'proposal-1' } })
    apiMock.resolveRoomProposal.mockResolvedValue({ id: 'proposal-1', status: 'adopted' })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('interviewing'))

    await act(async () => {
      await result.current.answer({ answerText: 'She never sells the recipes.', origin: 'extrapolated' })
    })
    expect(apiMock.answerInterviewQuestion).toHaveBeenCalledWith('p1', 's1', { answerText: 'She never sells the recipes.', origin: 'extrapolated', rejectMapping: false })
    expect(apiMock.resolveRoomProposal).toHaveBeenCalledWith('p1', 'proposal-1', 'adopted', { resolvedValue: 'She never sells the recipes.', origin: 'extrapolated' })
  })

  it('answer with rejectMapping does not adopt the proposal', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: question })
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: null, proposal: { id: 'proposal-1' } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('interviewing'))

    await act(async () => {
      await result.current.answer({ answerText: 'Maybe the sea took him.', origin: 'seed', rejectMapping: true })
    })
    expect(apiMock.resolveRoomProposal).not.toHaveBeenCalled()
  })

  it('bank marks the seed banked and stores the preview', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '### Locks\n[SEED] x' } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('readback'))

    await act(async () => {
      await result.current.bank()
    })
    expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', {})
    expect(result.current.status.hasBankedSeed).toBe(true)
    expect(result.current.status.actionLabel).toBe('New interview round')
    expect(result.current.bankPreview?.conceptSeedAppend).toContain('### Locks')
  })

  it('previewBank and bank pass the writer mutability map through', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
    apiMock.fetchInterviewBankPreview.mockResolvedValue({ conceptSeedAppend: '', taggable: [] })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '', taggable: [] } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('readback'))

    await act(async () => {
      await result.current.previewBank({ 'p-1': 'leaning' })
    })
    expect(apiMock.fetchInterviewBankPreview).toHaveBeenCalledWith('p1', 's1', { 'p-1': 'leaning' })

    await act(async () => {
      await result.current.bank({ 'p-1': 'leaning', 'p-2': 'open' })
    })
    expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', { 'p-1': 'leaning', 'p-2': 'open' })
  })

  it('surfaces action errors without crashing and clears them', async () => {
    apiMock.startInterview.mockRejectedValue(new Error('room api 500: boom'))
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalled())

    let ok = true
    await act(async () => {
      ok = await result.current.start({ mode: 'full', seedText: 'seed' })
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('room api 500: boom')
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('pause and resume update the active session state', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: question })
    apiMock.pauseInterview.mockResolvedValue({ session: session('paused') })
    apiMock.resumeInterview.mockResolvedValue({ session: session('interviewing') })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('interviewing'))

    await act(async () => {
      await result.current.pause()
    })
    expect(result.current.status.activeSession?.state).toBe('paused')

    await act(async () => {
      await result.current.resume()
    })
    expect(result.current.status.activeSession?.state).toBe('interviewing')
  })
})
