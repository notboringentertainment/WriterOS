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
  rationale: 'Project Meeting answer to morgan-locks',
  status: 'pending',
  resolved_at: null,
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'morgan-locks',
  origin: 'extrapolated',
  created_at: '2026-07-08T00:00:00Z',
}

function renderChannel(onOpenProjectMeeting?: () => void) {
  render(
    <RoomChannel
      projectId="p1"
      characterNames={[]}
      locksText=""
      onAdoptProposal={() => true}
      onOpenProjectMeeting={onOpenProjectMeeting}
    />,
  )
}

beforeEach(() => {
  Object.values(apiMock).forEach(mock => mock.mockReset())
  apiMock.fetchRoomMessages.mockResolvedValue([])
  apiMock.fetchRoomProposals.mockResolvedValue([])
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
  apiMock.openRoomStream.mockReturnValue(() => {})
  apiMock.postRoomEvent.mockResolvedValue(undefined)
  apiMock.syncStoryLocksBlock.mockResolvedValue(undefined)
})

// The interview itself lives on the Project Meeting page (ProjectMeetingPage.test.tsx);
// the dock only surfaces standing and a way there.
describe('RoomChannel Project Meeting status line', () => {
  it('shows a start link when no meeting exists and opens the meeting page without auto-starting', async () => {
    const onOpen = vi.fn()
    renderChannel(onOpen)

    const status = await screen.findByTestId('project-meeting-status')
    expect(status).toHaveTextContent('Project Meeting · not started')

    fireEvent.click(screen.getByRole('button', { name: 'Start Project Meeting' }))
    expect(onOpen).toHaveBeenCalled()
    expect(apiMock.startInterview).not.toHaveBeenCalled()
  })

  it('reflects a paused meeting with a resume link', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('paused'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
    renderChannel(vi.fn())

    const status = await screen.findByTestId('project-meeting-status')
    await waitFor(() => expect(status).toHaveTextContent('Project Meeting · paused'))
    expect(screen.getByRole('button', { name: 'Resume Project Meeting' })).toBeInTheDocument()
  })

  it('reflects a banked meeting with a new-round link', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null })
    renderChannel(vi.fn())

    const status = await screen.findByTestId('project-meeting-status')
    await waitFor(() => expect(status).toHaveTextContent('Project Meeting · banked'))
    expect(screen.getByRole('button', { name: 'New interview round' })).toBeInTheDocument()
  })

  it('hides the status line without an onOpenProjectMeeting handler', async () => {
    renderChannel(undefined)

    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('project-meeting-status')).not.toBeInTheDocument()
  })

  it('never renders interview_answer proposals as ambient cards', async () => {
    apiMock.fetchRoomProposals.mockResolvedValue([interviewProposal])
    renderChannel(vi.fn())

    await waitFor(() => expect(apiMock.fetchRoomProposals).toHaveBeenCalled())
    expect(screen.queryByTestId('proposal-card')).not.toBeInTheDocument()
  })
})
