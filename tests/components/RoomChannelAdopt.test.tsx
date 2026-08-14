import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    answerInterviewQuestion: vi.fn(),
    bankInterview: vi.fn(),
    exportInterview: vi.fn(),
    fetchInterviewBankPreview: vi.fn(),
    fetchInterviewStatus: vi.fn(),
    fetchRoomMessages: vi.fn(),
    fetchRoomProposals: vi.fn(),
    ensureRoomMemory: vi.fn(),
    isRoomMemoryUnavailable: vi.fn(),
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
import type { RoomProposal, RoomStreamEvent } from '../../client/src/lib/roomApi'

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

const pendingInterviewProposal: RoomProposal = {
  ...pendingProposal,
  id: 'prop-interview-1',
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'morgan-locks',
  origin: 'seed',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  Object.values(apiMock).forEach((mock) => mock.mockReset())
  apiMock.fetchRoomMessages.mockResolvedValue([])
  apiMock.fetchRoomProposals.mockResolvedValue([pendingProposal])
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
  apiMock.openRoomStream.mockReturnValue(() => {})
  apiMock.postRoomEvent.mockResolvedValue({ outcome: 'ok' })
  apiMock.syncStoryLocksBlock.mockResolvedValue({ outcome: 'ok' })
  apiMock.ensureRoomMemory.mockResolvedValue({ outcome: 'ok' })
  apiMock.isRoomMemoryUnavailable.mockReturnValue(false)
})

function channel(projectScopeKey: string, onAdoptProposal: (p: RoomProposal) => boolean, projectId = 'p1') {
  return (
    <RoomChannel
      projectId={projectId}
      projectScopeKey={projectScopeKey}
      characterNames={['Rosa']}
      characterBriefs={[{ id: 'r1', name: 'Rosa', want: 'win the contest' }]}
      surfaceAwareness={{ kind: 'none' }}
      locksText=""
      onAdoptProposal={onAdoptProposal}
    />
  )
}

function EmitDuringLayout({ emit }: { emit?: () => void }) {
  useLayoutEffect(() => { emit?.() }, [emit])
  return null
}

function renderChannel(onAdoptProposal: (p: RoomProposal) => boolean) {
  return render(
    channel('folder:p1', onAdoptProposal),
  )
}

describe('RoomChannel proposal adoption ordering', () => {
  it('ignores stale history and proposal success after the stable project UI scope changes', async () => {
    const messagesA = deferred<Awaited<ReturnType<typeof apiMock.fetchRoomMessages>>>()
    const proposalsA = deferred<Awaited<ReturnType<typeof apiMock.fetchRoomProposals>>>()
    apiMock.fetchRoomMessages
      .mockImplementationOnce(() => messagesA.promise)
      .mockResolvedValueOnce([{ id: 'message-b', project_id: 'p1', author: 'casey', kind: 'say', content: 'Current B history.', reply_to: null, created_at: 'now' }])
    apiMock.fetchRoomProposals
      .mockImplementationOnce(() => proposalsA.promise)
      .mockResolvedValueOnce([])
    const { rerender } = render(channel('browser:A', vi.fn()))
    await waitFor(() => expect(apiMock.fetchRoomMessages).toHaveBeenCalledTimes(1))

    rerender(channel('browser:B', vi.fn()))
    expect(await screen.findByText('Current B history.')).toBeInTheDocument()

    await act(async () => {
      messagesA.resolve([{ id: 'message-a', project_id: 'p1', author: 'casey', kind: 'say', content: 'Stale A history.', reply_to: null, created_at: 'now' }])
      proposalsA.resolve([pendingProposal])
      await Promise.all([messagesA.promise, proposalsA.promise])
    })
    expect(screen.queryByText('Stale A history.')).not.toBeInTheDocument()
    expect(screen.queryByText('win back the restaurant')).not.toBeInTheDocument()
    expect(screen.getByText('Current B history.')).toBeInTheDocument()
  })

  it('does not restore a stale send error or apply a stale resolved proposal after a scope switch', async () => {
    const sendA = deferred<void>()
    const resolveA = deferred<RoomProposal>()
    apiMock.sendRoomMessage.mockImplementationOnce(() => sendA.promise)
    apiMock.resolveRoomProposal.mockImplementationOnce(() => resolveA.promise)
    const onAdoptA = vi.fn().mockReturnValue(true)
    const onAdoptB = vi.fn().mockReturnValue(true)
    const { rerender } = render(channel('browser:A', onAdoptA))
    const input = screen.getByPlaceholderText('Say something to the room…')
    fireEvent.change(input, { target: { value: 'stale A draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to the room' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Adopt' }))

    rerender(channel('browser:B', onAdoptB))
    await act(async () => {
      sendA.reject(new Error('stale A send failed'))
      resolveA.resolve({ ...pendingProposal, status: 'adopted', resolved_at: 'now' })
      await Promise.allSettled([sendA.promise, resolveA.promise])
    })

    expect(screen.getByPlaceholderText('Say something to the room…')).toHaveValue('')
    expect(screen.queryByText('stale A send failed')).not.toBeInTheDocument()
    expect(onAdoptA).not.toHaveBeenCalled()
    expect(onAdoptB).not.toHaveBeenCalled()
  })

  it.each(['reused-ui-key', ''])('binds project identity to caller scope %j for pending room mutations', async scope => {
    const sendA = deferred<void>()
    apiMock.sendRoomMessage.mockImplementationOnce(() => sendA.promise)
    const { rerender } = render(channel(scope, vi.fn(), 'project-a'))
    const input = screen.getByPlaceholderText('Say something to the room…')
    fireEvent.change(input, { target: { value: 'project A draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to the room' }))

    rerender(channel(scope, vi.fn(), 'project-b'))
    await act(async () => {
      sendA.reject(new Error('stale project A failure'))
      await Promise.allSettled([sendA.promise])
    })

    expect(screen.queryByText('stale project A failure')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Say something to the room…')).toHaveValue('')
  })

  it('rejects an old stream callback in the render-to-passive-cleanup window', async () => {
    let oldStreamEvent: ((event: RoomStreamEvent) => void) | undefined
    apiMock.openRoomStream.mockImplementationOnce((_projectId, onEvent) => {
      oldStreamEvent = onEvent
      return () => {}
    })
    const { container, rerender } = render(
      <>
        {channel('shared-ui-key', vi.fn(), 'project-a')}
        <EmitDuringLayout />
      </>,
    )
    await waitFor(() => expect(oldStreamEvent).toBeTypeOf('function'))
    const observedText: string[] = []
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) observedText.push(node.textContent ?? '')
      }
    })
    observer.observe(container, { childList: true, subtree: true })

    rerender(
      <>
        {channel('shared-ui-key', vi.fn(), 'project-b')}
        <EmitDuringLayout emit={() => oldStreamEvent?.({
          type: 'message',
          message: {
            id: 'stale-window-message',
            project_id: 'project-a',
            author: 'casey',
            kind: 'say',
            content: 'Stale render-window message.',
            reply_to: null,
            created_at: 'now',
          },
        })} />
      </>,
    )
    await act(async () => { await Promise.resolve() })
    observer.disconnect()

    expect(observedText.join('\n')).not.toContain('Stale render-window message.')
  })

  it('keeps the current project stream live after a room-memory retry starts a newer load', async () => {
    let streamEvent: ((event: RoomStreamEvent) => void) | undefined
    apiMock.fetchRoomMessages.mockRejectedValueOnce(new Error('memory unavailable'))
    apiMock.isRoomMemoryUnavailable.mockReturnValue(true)
    apiMock.openRoomStream.mockImplementation((_projectId, onEvent) => {
      streamEvent = onEvent
      return () => {}
    })
    renderChannel(vi.fn())
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(apiMock.ensureRoomMemory).toHaveBeenCalledTimes(1))

    act(() => streamEvent?.({
      type: 'message',
      message: {
        id: 'message-after-retry',
        project_id: 'p1',
        author: 'casey',
        kind: 'say',
        content: 'The current stream still works.',
        reply_to: null,
        created_at: 'now',
      },
    }))

    expect(await screen.findByText('The current stream still works.')).toBeInTheDocument()
  })

  it('shows unified memory status on room messages and proposal cards', async () => {
    apiMock.fetchRoomMessages.mockResolvedValueOnce([{
      id: 'message-memory', project_id: 'p1', author: 'casey', kind: 'say', content: 'Memory-aware note.',
      reply_to: null, created_at: 'now',
      memory_receipt: { revision: 0, status: 'disabled', citations: [], conflictIds: [] },
    }])
    apiMock.fetchRoomProposals.mockResolvedValueOnce([{
      ...pendingProposal,
      memory_receipt: { revision: 64, status: 'available', citations: [], conflictIds: [] },
    }])

    renderChannel(vi.fn())

    expect(await screen.findByText(/project memory disabled/i)).toBeInTheDocument()
    expect(screen.getByText(/project memory revision 64/i)).toBeInTheDocument()
  })

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
        { kind: 'none' },
      ),
    )
    expect(input).toHaveValue('keep this thought')
    expect(await screen.findByText(/network down/)).toBeInTheDocument()
  })

  it('does not render interview answer proposals as ambient proposal cards', async () => {
    apiMock.fetchRoomProposals.mockResolvedValueOnce([pendingProposal, pendingInterviewProposal])
    renderChannel(vi.fn())

    expect(await screen.findByText('win back the restaurant')).toBeInTheDocument()
    expect(screen.getAllByTestId('proposal-card')).toHaveLength(1)
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
