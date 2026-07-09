import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    answerInterviewQuestion: vi.fn(),
    bankInterview: vi.fn(),
    exportInterview: vi.fn(),
    fetchInterviewBankPreview: vi.fn(),
    fetchInterviewStatus: vi.fn(),
    fetchRoomMessages: vi.fn(),
    fetchRoomProposals: vi.fn(),
    openRoomStream: vi.fn(),
    pauseInterview: vi.fn(),
    postRoomEvent: vi.fn(),
    resolveRoomProposal: vi.fn(),
    resumeInterview: vi.fn(),
    sendRoomMessage: vi.fn(),
    skipInterviewQuestion: vi.fn(),
    startInterview: vi.fn(),
    syncStoryLocksBlock: vi.fn(),
    wrapInterview: vi.fn(),
  },
}))
vi.mock('../../client/src/lib/roomApi', () => apiMock)

import { RoomChannel } from '../../client/src/components/room/RoomChannel'
import type { InterviewSession, RoomProposal } from '../../client/src/lib/roomApi'

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

const interviewProposal: RoomProposal = {
  id: 'proposal-1',
  project_id: 'p1',
  agent_id: 'morgan',
  surface: 'memory',
  field_path: 'story_locks',
  proposed_value: 'Never become cynical.',
  rationale: 'First Meeting answer to morgan-locks',
  status: 'pending',
  resolved_at: null,
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'morgan-locks',
  origin: 'extrapolated',
  created_at: '2026-07-08T00:00:00Z',
}

function renderChannel() {
  return render(
    <RoomChannel
      projectId="p1"
      characterNames={[]}
      locksText=""
      onAdoptProposal={() => true}
    />,
  )
}

beforeEach(() => {
  Object.values(apiMock).forEach(mock => mock.mockReset())
  apiMock.fetchRoomMessages.mockResolvedValue([])
  apiMock.fetchRoomProposals.mockResolvedValue([])
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
  apiMock.openRoomStream.mockReturnValue(() => {})
  apiMock.postRoomEvent.mockResolvedValue(undefined)
  apiMock.syncStoryLocksBlock.mockResolvedValue(undefined)
})

describe('RoomChannel First Meeting panel', () => {
  it('shows explicit start and visible skip without auto-starting', async () => {
    renderChannel()

    expect(await screen.findByText('First Meeting')).toBeInTheDocument()
    expect(screen.getByText(/Skip is simply/)).toBeInTheDocument()
    expect(apiMock.startInterview).not.toHaveBeenCalled()
  })

  it('starts from seed, answers, skips, pauses/resumes, banks, and exports through visible controls', async () => {
    const firstQuestion = { id: 'morgan-locks', lane: 'morgan', trigger: 'locks', question: 'What is not allowed?', writerOSTarget: 'story_locks', templateDestination: '## Locks', originOnConfirm: 'seed', requirement: 'required', budget: 2 }
    apiMock.startInterview.mockResolvedValueOnce({ session: session('interviewing'), auditMessage: 'Morgan audit', currentQuestion: firstQuestion })
    apiMock.answerInterviewQuestion.mockResolvedValueOnce({ session: session('interviewing'), proposal: interviewProposal, currentQuestion: firstQuestion })
    apiMock.resolveRoomProposal.mockResolvedValueOnce({ ...interviewProposal, status: 'adopted', resolved_at: '2026-07-08T00:01:00Z', resolved_value: 'Never become cynical.' })
    apiMock.skipInterviewQuestion.mockResolvedValueOnce({ session: session('readback'), currentQuestion: null })
    apiMock.fetchInterviewBankPreview.mockResolvedValueOnce({ conceptSeedAppend: '## First Meeting Round\nseed', seedText: 'seed', locks: [], openQuestions: [], datedAnswers: [], seedColor: [], leanings: [], title: 'Untitled' })
    apiMock.bankInterview.mockResolvedValueOnce({ session: session('banked'), preview: { conceptSeedAppend: 'banked seed' } })
    apiMock.exportInterview.mockResolvedValueOnce({ session: session('exported'), markdown: '# Hearth Ghosts\n\n## Seed' })

    renderChannel()
    fireEvent.change(await screen.findByLabelText('First Meeting seed'), { target: { value: 'thin seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start First Meeting' }))
    await waitFor(() => expect(apiMock.startInterview).toHaveBeenCalledWith('p1', { mode: 'full', seedText: 'thin seed' }))

    fireEvent.change(await screen.findByLabelText('First Meeting answer'), { target: { value: 'Never become cynical.' } })
    fireEvent.change(screen.getByLabelText('First Meeting answer origin'), { target: { value: 'extrapolated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mapping' }))
    await waitFor(() => expect(apiMock.answerInterviewQuestion).toHaveBeenCalledWith('p1', 's1', { answerText: 'Never become cynical.', origin: 'extrapolated', rejectMapping: false }))
    await waitFor(() => expect(apiMock.resolveRoomProposal).toHaveBeenCalledWith('p1', 'proposal-1', 'adopted', { resolvedValue: 'Never become cynical.', origin: 'extrapolated' }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip / delegate' }))
    await waitFor(() => expect(apiMock.skipInterviewQuestion).toHaveBeenCalledWith('p1', 's1'))

    fireEvent.click(await screen.findByRole('button', { name: 'Preview banking' }))
    await waitFor(() => expect(apiMock.fetchInterviewBankPreview).toHaveBeenCalledWith('p1', 's1', {}))
    expect(await screen.findByText(/First Meeting Round/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bank this round' }))
    await waitFor(() => expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', {}))
    expect(await screen.findByText(/round is banked/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Export to PitchStudio' }))
    await waitFor(() => expect(apiMock.exportInterview).toHaveBeenCalledWith('p1', 's1'))
    expect(await screen.findByText(/# Hearth Ghosts/)).toBeInTheDocument()
  })
})
