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
    redirectInterviewArea: vi.fn(),
    skipInterviewQuestion: vi.fn(),
    startInterview: vi.fn(),
    wrapInterview: vi.fn(),
    createPitchPacketDraft: vi.fn(), savePitchPacketDraft: vi.fn(), approvePitchPacket: vi.fn(), exportPitchPacket: vi.fn(), fetchExportedPitchPacket: vi.fn(),
  },
}))
vi.mock('../../client/src/lib/roomApi', () => apiMock)
const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }))
vi.mock('../../client/src/lib/downloadTextFile', () => ({ downloadTextFile: downloadMock }))

import { useInterviewSession } from '../../client/src/lib/useInterviewSession'
import type { InterviewSession } from '../../client/src/lib/roomApi'
import { createEmptyDocuments } from '../../shared/documents'
import type { PitchPacket } from '../../shared/pitchPacket'

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
    bank_snapshot: null,
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
  apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null, recap: [] })
  downloadMock.mockReset()
})

describe('useInterviewSession', () => {
  it('loads interview status on mount', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('paused'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
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
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: question })
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

  it('advances the session even when proposal adoption fails after a recorded answer', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: question })
    const nextQuestion = { ...question, id: 'morgan-ending' }
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: nextQuestion, proposal: { id: 'proposal-1' } })
    apiMock.resolveRoomProposal.mockRejectedValue(new Error('room api 409: already resolved'))
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('interviewing'))

    let ok = false
    await act(async () => {
      ok = await result.current.answer({ answerText: 'She never sells the recipes.', origin: 'seed' })
    })
    // The answer was recorded server-side: the UI moves on and surfaces a scoped error.
    expect(ok).toBe(true)
    expect(result.current.status.currentQuestion?.id).toBe('morgan-ending')
    expect(result.current.error).toContain('Answer recorded, but adopting the mapping failed')
  })

  it('an explicit null currentQuestion clears the question instead of pinning the stale one', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: question })
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: null })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.currentQuestion?.id).toBe('morgan-locks'))

    await act(async () => {
      await result.current.answer({ answerText: 'final answer', origin: 'seed' })
    })
    expect(result.current.status.currentQuestion).toBeNull()
  })

  it('a stale preview response never overwrites a newer one', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
    let resolveFirst: (v: unknown) => void = () => {}
    apiMock.fetchInterviewBankPreview
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ preview: { conceptSeedAppend: 'NEWER', taggable: [] }, finalValues: { concept_seed: 'new', story_locks: 'new', open_questions: 'new' } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('readback'))

    let firstRequest: Promise<void>
    await act(async () => {
      firstRequest = result.current.previewBank({})
      await result.current.previewBank({ 'p-1': 'leaning' })
    })
    expect(result.current.bankPreview?.conceptSeedAppend).toBe('NEWER')

    // The slow first response arrives last — and must be discarded.
    await act(async () => {
      resolveFirst({ preview: { conceptSeedAppend: 'STALE', taggable: [] }, finalValues: { concept_seed: 'old', story_locks: 'old', open_questions: 'old' } })
      await firstRequest!
    })
    expect(result.current.bankPreview?.conceptSeedAppend).toBe('NEWER')
  })

  it('answer with rejectMapping does not adopt the proposal', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: question })
    apiMock.answerInterviewQuestion.mockResolvedValue({ session: session('interviewing'), currentQuestion: null, proposal: { id: 'proposal-1' } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('interviewing'))

    await act(async () => {
      await result.current.answer({ answerText: 'Maybe the sea took him.', origin: 'seed', rejectMapping: true })
    })
    expect(apiMock.resolveRoomProposal).not.toHaveBeenCalled()
  })

  it('bank marks the seed banked and stores the preview', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '### Locks\n[SEED] x' } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('readback'))

    await act(async () => {
      await result.current.bank()
    })
    expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', {}, [])
    expect(result.current.status.hasBankedSeed).toBe(true)
    expect(result.current.status.actionLabel).toBe('New interview round')
    expect(result.current.bankPreview?.conceptSeedAppend).toContain('### Locks')
  })

  it('previewBank and bank pass the writer mutability map through', async () => {
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })
    apiMock.fetchInterviewBankPreview.mockResolvedValue({ preview: { conceptSeedAppend: '', taggable: [] }, finalValues: { concept_seed: '', story_locks: '', open_questions: '' } })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '', taggable: [] } })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('readback'))

    await act(async () => {
      await result.current.previewBank({ 'p-1': 'leaning' })
    })
    expect(apiMock.fetchInterviewBankPreview).toHaveBeenCalledWith('p1', 's1', { 'p-1': 'leaning' }, [])

    await act(async () => {
      await result.current.bank({ 'p-1': 'leaning', 'p-2': 'open' })
    })
    expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', { 'p-1': 'leaning', 'p-2': 'open' }, [])
  })

  it('defaults recap decisions to keep, carries revisions through preview/bank, and redirects immediately', async () => {
    const recap = [{ decisionId: 'd1', sessionId: 'old', area: 'ending', fieldPath: 'story_locks', statement: 'Old ending.', roundNumber: 1, questionId: 'morgan-ending' }]
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('readback'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap })
    apiMock.fetchInterviewBankPreview.mockResolvedValue({ preview: { conceptSeedAppend: '', taggable: [] }, finalValues: { concept_seed: '', story_locks: '', open_questions: '' }, directionDiff: [], directionRevision: 3 })
    apiMock.bankInterview.mockResolvedValue({ session: session('banked'), preview: { conceptSeedAppend: '', taggable: [] } })
    apiMock.redirectInterviewArea.mockResolvedValue({ session: session('interviewing'), currentQuestion: question })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.recap).toEqual(recap))
    expect(result.current.revisionOperations).toEqual([{ op: 'keep', targetId: 'd1' }])

    act(() => result.current.setRevisionOperation({ op: 'revise', targetId: 'd1', statement: 'New ending.' }))
    await act(async () => result.current.previewBank())
    expect(apiMock.fetchInterviewBankPreview).toHaveBeenLastCalledWith('p1', 's1', {}, [{ op: 'revise', targetId: 'd1', statement: 'New ending.' }])
    await act(async () => result.current.bank())
    expect(apiMock.bankInterview).toHaveBeenCalledWith('p1', 's1', {}, [{ op: 'revise', targetId: 'd1', statement: 'New ending.' }])

    await act(async () => result.current.redirect('ending', 'morgan-ending'))
    expect(apiMock.redirectInterviewArea).toHaveBeenCalledWith('p1', 's1', 'ending', 'morgan-ending')
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
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('interviewing'), hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: question })
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

  it('creates a review and exports transactionally before downloading Markdown and JSON', async () => {
    const approved = <T,>(value: T) => ({ value, origin: 'writer' as const, approved: true, sourceRef: 'writer:test' })
    const packet: PitchPacket = { packetVersion: 1, projectId: 'p1', exportedAt: '2026-07-14T00:00:00Z', directionRevision: 2,
      title: approved('Ace'), logline: approved('Logline'), format: approved('Feature'), genre: approved('Thriller'), tone: approved('Tense'), premise: approved('Premise'), storyEngine: approved('Engine'),
      coreCharacters: approved([{ name: 'Ace', role: '', want: '', need: '', flawOrWound: '', secretOrContradiction: '', arc: '' }]), locks: approved([]), openQuestions: approved([]) }
    const draft = { id: 'packet-1', project_id: 'p1', session_id: 's1', packet, packet_version: 1, status: 'draft', direction_revision: 2, created_at: 'now', exported_at: null }
    const exported = { ...draft, status: 'exported', exported_at: '2026-07-14T01:00:00Z' }
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: draft, proposalUnavailable: false })
    apiMock.exportPitchPacket.mockResolvedValue(exported)
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    const documents = createEmptyDocuments()
    await act(async () => result.current.openPitchPacket(documents, 'Ace'))
    expect(result.current.pitchPacketRow?.status).toBe('draft')
    await act(async () => result.current.exportPitchPacketFiles())
    expect(apiMock.exportPitchPacket.mock.invocationCallOrder[0]).toBeLessThan(downloadMock.mock.invocationCallOrder[0])
    expect(downloadMock).toHaveBeenNthCalledWith(1, 'ace-pitch-packet-v1-r2.md', expect.stringContaining('## Premise'), 'text/markdown')
    expect(downloadMock).toHaveBeenNthCalledWith(2, 'ace-pitch-packet-v1-r2.json', expect.stringContaining('"packetVersion": 1'), 'application/json')
    expect(result.current.pitchPacketRow?.status).toBe('exported')
    expect(result.current.packetMessage).toBe('Pitch Packet exported. Two files downloaded: Markdown and JSON.')
  })

  it('keeps exported state after a download failure and re-downloads the persisted packet', async () => {
    const approved = <T,>(value: T) => ({ value, origin: 'writer' as const, approved: true, sourceRef: 'writer:test' })
    const packet: PitchPacket = { packetVersion: 1, projectId: 'p1', exportedAt: '2026-07-14T00:00:00Z', directionRevision: 2,
      title: approved('Ace'), logline: approved('Logline'), format: approved('Feature'), genre: approved('Thriller'), tone: approved('Tense'), premise: approved('Premise'), storyEngine: approved('Engine'),
      coreCharacters: approved([{ name: 'Ace', role: '', want: '', need: '', flawOrWound: '', secretOrContradiction: '', arc: '' }]), locks: approved([]), openQuestions: approved([]) }
    const draft = { id: 'packet-1', project_id: 'p1', session_id: 's1', packet, packet_version: 1, status: 'approved', direction_revision: 2, created_at: 'now', exported_at: null }
    const exported = { ...draft, status: 'exported', exported_at: '2026-07-14T01:00:00Z' }
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: draft, proposalUnavailable: false })
    apiMock.exportPitchPacket.mockResolvedValue(exported)
    apiMock.fetchExportedPitchPacket.mockResolvedValue(exported)
    downloadMock.mockImplementationOnce(() => { throw new Error('downloads blocked') })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'Ace'))

    await act(async () => result.current.exportPitchPacketFiles())
    expect(result.current.pitchPacketRow?.status).toBe('exported')
    expect(result.current.packetDownloadError).toBe('downloads blocked')

    downloadMock.mockReset()
    await act(async () => result.current.redownloadPitchPacket())
    expect(apiMock.fetchExportedPitchPacket).toHaveBeenCalledWith('p1', 's1')
    expect(downloadMock).toHaveBeenCalledTimes(2)
    expect(result.current.packetDownloadError).toBeNull()
  })
})
