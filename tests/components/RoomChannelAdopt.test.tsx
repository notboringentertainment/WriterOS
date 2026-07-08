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
import type { RoomProposal } from '../../client/src/lib/roomApi'

const pendingProposal: RoomProposal = {
  id: 'prop-1',
  project_id: 'p1',
  agent_id: 'casey',
  surface: 'storyBible',
  field_path: 'characters[r1].want',
  proposed_value: 'win back the restaurant',
  rationale: 'points the want at the wound',
  status: 'pending',
  resolved_at: null,
  created_at: '2026-07-07T00:00:00Z',
}

beforeEach(() => {
  Object.values(apiMock).forEach((mock) => mock.mockReset())
  apiMock.fetchRoomMessages.mockResolvedValue([])
  apiMock.fetchRoomProposals.mockResolvedValue([pendingProposal])
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })
  apiMock.openRoomStream.mockReturnValue(() => {})
  apiMock.postRoomEvent.mockResolvedValue(undefined)
  apiMock.syncStoryLocksBlock.mockResolvedValue(undefined)
})

function renderChannel(onAdoptProposal: (p: RoomProposal) => boolean) {
  return render(
    <RoomChannel
      projectId="p1"
      characterNames={['Rosa']}
      characterBriefs={[{ id: 'r1', name: 'Rosa', want: 'win the contest' }]}
      locksText=""
      onAdoptProposal={onAdoptProposal}
    />,
  )
}

describe('RoomChannel proposal adoption ordering', () => {
  it('restores the writer draft when send fails', async () => {
    apiMock.sendRoomMessage.mockRejectedValueOnce(new Error('network down'))
    renderChannel(vi.fn())

    const input = screen.getByPlaceholderText('Say something to the room…')
    fireEvent.change(input, { target: { value: 'keep this thought' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to the room' }))

    await waitFor(() =>
      expect(apiMock.sendRoomMessage).toHaveBeenCalledWith(
        'p1',
        'keep this thought',
        ['Rosa'],
        [{ id: 'r1', name: 'Rosa', want: 'win the contest' }],
      ),
    )
    expect(input).toHaveValue('keep this thought')
    expect(await screen.findByText(/network down/)).toBeInTheDocument()
  })

  it('does NOT write the document when the server resolve fails', async () => {
    apiMock.resolveRoomProposal.mockRejectedValueOnce(new Error('room api 409: not pending'))
    const onAdopt = vi.fn().mockReturnValue(true)
    renderChannel(onAdopt)

    const adopt = await screen.findByRole('button', { name: 'Adopt' })
    fireEvent.click(adopt)

    await waitFor(() => expect(apiMock.resolveRoomProposal).toHaveBeenCalledWith('p1', 'prop-1', 'adopted'))
    expect(onAdopt).not.toHaveBeenCalled() // resolve failed → no local mutation
    expect(await screen.findByText(/409/)).toBeInTheDocument() // surfaced, not swallowed
  })

  it('writes the document only AFTER a successful resolve and applies the server-confirmed resolved value', async () => {
    const order: string[] = []
    const resolvedProposal = {
      ...pendingProposal,
      status: 'adopted' as const,
      resolved_at: 'now',
      resolved_value: 'win back the restaurant on her own terms',
    }
    apiMock.resolveRoomProposal.mockImplementation(async () => {
      order.push('resolve')
      return resolvedProposal
    })
    const onAdopt = vi.fn(() => {
      order.push('apply')
      return true
    })
    renderChannel(onAdopt)

    fireEvent.click(await screen.findByRole('button', { name: 'Adopt' }))

    await waitFor(() => expect(onAdopt).toHaveBeenCalledWith(resolvedProposal))
    expect(order).toEqual(['resolve', 'apply'])
  })

  it('reject never touches the document', async () => {
    apiMock.resolveRoomProposal.mockResolvedValueOnce({ ...pendingProposal, status: 'rejected' as const, resolved_at: 'now' })
    const onAdopt = vi.fn().mockReturnValue(true)
    renderChannel(onAdopt)

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(apiMock.resolveRoomProposal).toHaveBeenCalledWith('p1', 'prop-1', 'rejected'))
    expect(onAdopt).not.toHaveBeenCalled()
  })
})
