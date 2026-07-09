import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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

import { FirstMeetingPage } from '../../client/src/components/ritual/FirstMeetingPage'
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

function statusOf(state: InterviewSession['state'] | null, currentQuestion: typeof question | null = null) {
  return {
    activeSession: state ? session(state) : null,
    hasBankedSeed: false,
    actionLabel: 'First Meeting' as const,
    currentQuestion,
  }
}

function renderPage(onExit = vi.fn()) {
  render(<FirstMeetingPage projectId="p1" projectTitle="Ace Handler" onExit={onExit} />)
  return onExit
}

beforeEach(() => {
  Object.values(apiMock).forEach(mock => mock.mockReset())
  apiMock.fetchInterviewStatus.mockResolvedValue(statusOf(null))
})

describe('FirstMeetingPage', () => {
  it('renders the intake offer with a skip affordance that exits', async () => {
    const onExit = renderPage()
    expect(await screen.findByTestId('ritual-page')).toBeInTheDocument()
    expect(screen.getByLabelText('First Meeting seed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Begin the meeting' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onExit).toHaveBeenCalled()
    expect(apiMock.startInterview).not.toHaveBeenCalled()
  })

  it('requires a seed before starting', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Begin the meeting' }))
    expect(await screen.findByText('Paste or type a seed before starting the First Meeting.')).toBeInTheDocument()
    expect(apiMock.startInterview).not.toHaveBeenCalled()
  })

  it('starts the interview from the seed and shows the first question', async () => {
    apiMock.startInterview.mockResolvedValue({ session: session('interviewing'), currentQuestion: question })
    renderPage()

    fireEvent.change(await screen.findByLabelText('First Meeting seed'), { target: { value: 'A grieving chef returns home.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Begin the meeting' }))

    expect(await screen.findByText('What must stay true no matter what?')).toBeInTheDocument()
    expect(apiMock.startInterview).toHaveBeenCalledWith('p1', { mode: 'full', seedText: 'A grieving chef returns home.' })
    expect(screen.getByLabelText('First Meeting answer')).toBeInTheDocument()
  })

  it('answers with the selected origin and adopts the mapping', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue(statusOf('interviewing', question))
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: null, proposal: { id: 'proposal-1' } })
    apiMock.resolveRoomProposal.mockResolvedValue({ id: 'proposal-1', status: 'adopted' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('First Meeting answer'), { target: { value: 'She never sells the recipes.' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Extrapolation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mapping' }))

    await waitFor(() => expect(apiMock.answerInterviewQuestion).toHaveBeenCalledWith('p1', 's1', {
      answerText: 'She never sells the recipes.',
      origin: 'extrapolated',
      rejectMapping: false,
    }))
    await waitFor(() => expect(apiMock.resolveRoomProposal).toHaveBeenCalledWith('p1', 'proposal-1', 'adopted', {
      resolvedValue: 'She never sells the recipes.',
      origin: 'extrapolated',
    }))
  })

  it('resumes a paused session', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue(statusOf('paused'))
    apiMock.resumeInterview.mockResolvedValue({ session: session('interviewing') })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Resume the meeting' }))
    await waitFor(() => expect(apiMock.resumeInterview).toHaveBeenCalledWith('p1', 's1'))
  })

  it('readback previews and banks the round', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue(statusOf('readback'))
    apiMock.fetchInterviewBankPreview.mockResolvedValue({ conceptSeedAppend: '### Locks\n[SEED] She never sells the recipes.' })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '### Locks\n[SEED] She never sells the recipes.' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Preview banking' }))
    expect(await screen.findByText(/never sells the recipes/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bank this round' }))
    await waitFor(() => expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1'))
    expect(await screen.findByText(/This round is banked/)).toBeInTheDocument()
  })

  it('banked stage exports to PitchStudio', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue(statusOf('banked'))
    apiMock.exportInterview.mockResolvedValue({ session: session('exported'), markdown: '# Ace Handler — Seed' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Export to PitchStudio' }))
    expect(await screen.findByText('# Ace Handler — Seed')).toBeInTheDocument()
  })
})
