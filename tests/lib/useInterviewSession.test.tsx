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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function pitchRow(status: 'draft' | 'approved' | 'exported' = 'draft') {
  return {
    id: 'packet-1', project_id: 'p1', session_id: 's1', packet: {} as PitchPacket,
    packet_version: 1, status, direction_revision: 2, created_at: 'now',
    exported_at: status === 'exported' ? '2026-07-14T01:00:00Z' : null,
  }
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

  it('restores the persisted exported packet for re-download after reload', async () => {
    const exported = { id: 'packet-1', project_id: 'p1', session_id: 's1', packet: {}, packet_version: 1, status: 'exported', direction_revision: 2, created_at: 'now', exported_at: '2026-07-14T01:00:00Z' }
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, latestTerminalSession: session('exported'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.fetchExportedPitchPacket.mockResolvedValue(exported)

    const { result } = renderHook(() => useInterviewSession('p1'))

    await waitFor(() => expect(result.current.pitchPacketRow?.status).toBe('exported'))
    expect(apiMock.fetchExportedPitchPacket).toHaveBeenCalledWith('p1', 's1')
  })

  it('start begins a session and surfaces the first question', async () => {
    const memoryReceipt = { revision: 0, status: 'disabled', citations: [], conflictIds: [] }
    apiMock.startInterview.mockResolvedValue({ session: session('interviewing'), currentQuestion: question, memoryReceipt })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalled())

    let ok = false
    await act(async () => {
      ok = await result.current.start({ mode: 'full', seedText: 'A grieving chef returns home.' })
    })
    expect(ok).toBe(true)
    expect(apiMock.startInterview).toHaveBeenCalledWith('p1', { mode: 'full', seedText: 'A grieving chef returns home.' })
    expect(result.current.status.currentQuestion?.id).toBe('morgan-locks')
    expect(result.current.memoryReceipt).toEqual(memoryReceipt)
  })

  it('ignores a stale start completion after scope change while the current scope can start', async () => {
    const startA = deferred<Awaited<ReturnType<typeof apiMock.startInterview>>>()
    const receiptA = { revision: 10, status: 'available', citations: [], conflictIds: [] }
    const receiptB = { revision: 20, status: 'available', citations: [], conflictIds: [] }
    apiMock.startInterview
      .mockImplementationOnce(() => startA.promise)
      .mockResolvedValueOnce({ session: { ...session('interviewing'), id: 'session-b' }, currentQuestion: { ...question, id: 'question-b' }, memoryReceipt: receiptB })
    const { result, rerender } = renderHook(
      ({ scope }) => useInterviewSession('p1', scope),
      { initialProps: { scope: 'browser:A' } },
    )
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalled())

    let staleStart!: Promise<boolean>
    act(() => { staleStart = result.current.start({ mode: 'full', seedText: 'A seed' }) })
    rerender({ scope: 'browser:B' })
    let currentOk = false
    await act(async () => {
      currentOk = await result.current.start({ mode: 'full', seedText: 'B seed' })
    })
    expect(currentOk).toBe(true)
    expect(result.current.status.currentQuestion?.id).toBe('question-b')
    expect(result.current.memoryReceipt).toEqual(receiptB)

    let staleOk = true
    await act(async () => {
      startA.resolve({ session: session('interviewing'), currentQuestion: question, memoryReceipt: receiptA })
      staleOk = await staleStart
    })
    expect(staleOk).toBe(false)
    expect(result.current.status.currentQuestion?.id).toBe('question-b')
    expect(result.current.memoryReceipt).toEqual(receiptB)
  })

  it('uses one same-project operation clock so an older status cannot overwrite a newer start', async () => {
    const staleStatus = deferred<Awaited<ReturnType<typeof apiMock.fetchInterviewStatus>>>()
    const started = { ...session('interviewing'), id: 'session-new' }
    apiMock.fetchInterviewStatus.mockImplementationOnce(() => staleStatus.promise)
    apiMock.startInterview.mockResolvedValue({
      session: started,
      currentQuestion: { ...question, id: 'question-new' },
      memoryReceipt: { revision: 31, status: 'available', citations: [], conflictIds: [] },
    })
    const { result } = renderHook(() => useInterviewSession('p1', 'browser:shared'))
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalledTimes(1))

    let startOk = false
    await act(async () => {
      startOk = await result.current.start({ mode: 'full', seedText: 'Newest operation.' })
    })
    expect(startOk).toBe(true)

    await act(async () => {
      staleStatus.resolve({
        activeSession: { ...session('paused'), id: 'session-stale-status' },
        hasBankedSeed: false,
        actionLabel: 'Project Meeting',
        currentQuestion: null,
        recap: [],
      })
      await staleStatus.promise
    })

    expect(result.current.status.activeSession?.id).toBe('session-new')
    expect(result.current.status.currentQuestion?.id).toBe('question-new')
    expect(result.current.memoryReceipt?.revision).toBe(31)
  })

  it('uses one same-project operation clock so an older start cannot overwrite a newer Pitch Packet operation', async () => {
    const staleStart = deferred<Awaited<ReturnType<typeof apiMock.startInterview>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.startInterview.mockImplementationOnce(() => staleStart.promise)
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: { ...pitchRow(), id: 'packet-new' }, proposalUnavailable: false })
    const { result } = renderHook(() => useInterviewSession('p1', 'browser:shared'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))

    let oldStart!: Promise<boolean>
    act(() => { oldStart = result.current.start({ mode: 'full', seedText: 'Older start.' }) })
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'Newest packet'))
    expect(result.current.pitchPacketRow?.id).toBe('packet-new')

    let staleOk = true
    await act(async () => {
      staleStart.resolve({
        session: { ...session('interviewing'), id: 'session-stale-start' },
        currentQuestion: { ...question, id: 'question-stale-start' },
        memoryReceipt: { revision: 12, status: 'available', citations: [], conflictIds: [] },
      })
      staleOk = await oldStart
    })

    expect(staleOk).toBe(false)
    expect(result.current.status.activeSession?.state).toBe('banked')
    expect(result.current.pitchPacketRow?.id).toBe('packet-new')
    expect(result.current.memoryReceipt).toBeUndefined()
  })

  it('invalidates nested exported-history work when a newer same-project start wins', async () => {
    const staleExportedPacket = deferred<Awaited<ReturnType<typeof apiMock.fetchExportedPitchPacket>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({
      activeSession: null,
      latestTerminalSession: session('exported'),
      hasBankedSeed: true,
      actionLabel: 'New interview round',
      currentQuestion: null,
      recap: [],
    })
    apiMock.fetchExportedPitchPacket.mockImplementationOnce(() => staleExportedPacket.promise)
    apiMock.startInterview.mockResolvedValue({
      session: { ...session('interviewing'), id: 'session-new' },
      currentQuestion: { ...question, id: 'question-new' },
      memoryReceipt: { revision: 42, status: 'available', citations: [], conflictIds: [] },
    })
    const { result } = renderHook(() => useInterviewSession('p1', 'browser:shared'))
    await waitFor(() => expect(apiMock.fetchExportedPitchPacket).toHaveBeenCalledTimes(1))

    await act(async () => result.current.start({ mode: 'full', seedText: 'New start.' }))
    await act(async () => {
      staleExportedPacket.resolve({ ...pitchRow('exported'), id: 'packet-stale-history' })
      await staleExportedPacket.promise
    })

    expect(result.current.status.activeSession?.id).toBe('session-new')
    expect(result.current.pitchPacketRow).toBeNull()
  })

  it('keeps a newer same-project start when an older Pitch Packet draft finishes last', async () => {
    const stalePacket = deferred<Awaited<ReturnType<typeof apiMock.createPitchPacketDraft>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockImplementationOnce(() => stalePacket.promise)
    apiMock.startInterview.mockResolvedValue({
      session: { ...session('interviewing'), id: 'session-new-start' },
      currentQuestion: { ...question, id: 'question-new-start' },
      memoryReceipt: { revision: 52, status: 'available', citations: [], conflictIds: [] },
    })
    const { result } = renderHook(() => useInterviewSession('p1', 'browser:shared'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))

    let oldPacket!: Promise<void>
    act(() => { oldPacket = result.current.openPitchPacket(createEmptyDocuments(), 'Older packet') })
    await act(async () => result.current.start({ mode: 'full', seedText: 'Newer start.' }))
    await act(async () => {
      stalePacket.resolve({ row: { ...pitchRow(), id: 'packet-stale' }, proposalUnavailable: false })
      await oldPacket
    })

    expect(result.current.status.activeSession?.id).toBe('session-new-start')
    expect(result.current.pitchPacketRow).toBeNull()
    expect(result.current.memoryReceipt?.revision).toBe(52)
  })

  it('keeps a newer same-project Pitch Packet when an older refresh finishes last', async () => {
    const staleRefresh = deferred<Awaited<ReturnType<typeof apiMock.fetchInterviewStatus>>>()
    apiMock.fetchInterviewStatus
      .mockResolvedValueOnce({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
      .mockImplementationOnce(() => staleRefresh.promise)
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: { ...pitchRow(), id: 'packet-new' }, proposalUnavailable: false })
    const { result } = renderHook(() => useInterviewSession('p1', 'browser:shared'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))

    let oldRefresh!: Promise<void>
    act(() => { oldRefresh = result.current.refresh() })
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'Newer packet'))
    await act(async () => {
      staleRefresh.resolve({
        activeSession: { ...session('paused'), id: 'session-stale-refresh' },
        hasBankedSeed: false,
        actionLabel: 'Project Meeting',
        currentQuestion: null,
        recap: [],
      })
      await oldRefresh
    })

    expect(result.current.status.activeSession?.state).toBe('banked')
    expect(result.current.pitchPacketRow?.id).toBe('packet-new')
  })

  it.each(['reused-ui-key', ''])('binds the actual project to caller scope %j so an old project cannot complete into a new one', async scope => {
    const staleStart = deferred<Awaited<ReturnType<typeof apiMock.startInterview>>>()
    apiMock.startInterview.mockImplementationOnce(() => staleStart.promise)
    const { result, rerender } = renderHook(
      ({ projectId, uiKey }) => useInterviewSession(projectId, uiKey),
      { initialProps: { projectId: 'project-a', uiKey: scope } },
    )
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalledWith('project-a'))

    let oldStart!: Promise<boolean>
    act(() => { oldStart = result.current.start({ mode: 'full', seedText: 'Project A.' }) })
    rerender({ projectId: 'project-b', uiKey: scope })
    await waitFor(() => expect(apiMock.fetchInterviewStatus).toHaveBeenCalledWith('project-b'))

    let staleOk = true
    await act(async () => {
      staleStart.resolve({
        session: { ...session('interviewing'), id: 'session-project-a', project_id: 'project-a' },
        currentQuestion: question,
        memoryReceipt: { revision: 8, status: 'available', citations: [], conflictIds: [] },
      })
      staleOk = await oldStart
    })

    expect(staleOk).toBe(false)
    expect(result.current.status.activeSession).toBeNull()
    expect(result.current.memoryReceipt).toBeUndefined()
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

  it('opens a Pitch Packet from the latest banked round restored after reload', async () => {
    const banked = session('banked')
    const packet = { id: 'packet-1', project_id: 'p1', session_id: banked.id, packet: {} as PitchPacket, packet_version: 1, status: 'draft', direction_revision: 2, created_at: 'now', exported_at: null }
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: null, latestTerminalSession: banked, hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: packet, proposalUnavailable: false })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.latestTerminalSession?.state).toBe('banked'))

    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'Ace'))

    expect(apiMock.createPitchPacketDraft).toHaveBeenCalledWith('p1', banked.id, expect.anything(), { title: 'Ace' })
    expect(result.current.pitchPacketRow?.id).toBe('packet-1')
  })

  it('retains the exact Pitch Packet response receipt even when the row omits its optional copy', async () => {
    const banked = session('banked')
    const packet = { id: 'packet-1', project_id: 'p1', session_id: banked.id, packet: {} as PitchPacket, packet_version: 1, status: 'draft', direction_revision: 2, created_at: 'now', exported_at: null }
    const memoryReceipt = { revision: 77, status: 'available', citations: [], conflictIds: ['conflict-77'] }
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: banked, hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: packet, proposalUnavailable: false, memoryReceipt })
    const { result } = renderHook(() => useInterviewSession('p1'))
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))

    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'Ace'))

    expect(result.current.pitchPacketMemoryReceipt).toEqual(memoryReceipt)
  })

  it('ignores stale Pitch Packet draft and save completions after project scope changes', async () => {
    const openA = deferred<Awaited<ReturnType<typeof apiMock.createPitchPacketDraft>>>()
    const saveB = deferred<Awaited<ReturnType<typeof apiMock.savePitchPacketDraft>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft
      .mockImplementationOnce(() => openA.promise)
      .mockResolvedValueOnce({ row: pitchRow(), proposalUnavailable: false })
    apiMock.savePitchPacketDraft.mockImplementationOnce(() => saveB.promise)
    const { result, rerender } = renderHook(
      ({ scope }) => useInterviewSession('p1', scope),
      { initialProps: { scope: 'browser:A' } },
    )
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))

    let staleOpen!: Promise<void>
    act(() => { staleOpen = result.current.openPitchPacket(createEmptyDocuments(), 'A') })
    rerender({ scope: 'browser:B' })
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'B'))
    expect(result.current.pitchPacketRow?.id).toBe('packet-1')

    let staleSave!: Promise<void>
    act(() => { staleSave = result.current.savePitchPacket({} as PitchPacket) })
    rerender({ scope: 'browser:C' })
    await act(async () => {
      openA.resolve({ row: { ...pitchRow(), id: 'stale-open' }, proposalUnavailable: false, memoryReceipt: { revision: 1, status: 'available', citations: [], conflictIds: [] } })
      saveB.resolve({ ...pitchRow(), id: 'stale-save' })
      await Promise.all([staleOpen, staleSave])
    })
    expect(result.current.pitchPacketRow).toBeNull()
    expect(result.current.pitchPacketMemoryReceipt).toBeUndefined()
    expect(result.current.packetMessage).toBeNull()
  })

  it('stops Pitch Packet approval between awaits after scope change', async () => {
    const saved = deferred<Awaited<ReturnType<typeof apiMock.savePitchPacketDraft>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: pitchRow(), proposalUnavailable: false })
    apiMock.savePitchPacketDraft.mockImplementationOnce(() => saved.promise)
    const { result, rerender } = renderHook(
      ({ scope }) => useInterviewSession('p1', scope),
      { initialProps: { scope: 'browser:A' } },
    )
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'A'))

    let approval!: Promise<void>
    act(() => { approval = result.current.approvePitchPacketReview({} as PitchPacket) })
    rerender({ scope: 'browser:B' })
    await act(async () => {
      saved.resolve(pitchRow('approved'))
      await approval
    })

    expect(apiMock.approvePitchPacket).not.toHaveBeenCalled()
    expect(result.current.pitchPacketRow).toBeNull()
    expect(result.current.packetMessage).toBeNull()
  })

  it('does not download or surface stale export and re-download completions', async () => {
    const exportedA = deferred<Awaited<ReturnType<typeof apiMock.exportPitchPacket>>>()
    const fetchedC = deferred<Awaited<ReturnType<typeof apiMock.fetchExportedPitchPacket>>>()
    apiMock.fetchInterviewStatus.mockResolvedValue({ activeSession: session('banked'), hasBankedSeed: true, actionLabel: 'New interview round', currentQuestion: null, recap: [] })
    apiMock.createPitchPacketDraft.mockResolvedValue({ row: pitchRow('approved'), proposalUnavailable: false })
    apiMock.exportPitchPacket.mockImplementationOnce(() => exportedA.promise)
    apiMock.fetchExportedPitchPacket.mockImplementationOnce(() => fetchedC.promise)
    const { result, rerender } = renderHook(
      ({ scope }) => useInterviewSession('p1', scope),
      { initialProps: { scope: 'browser:A' } },
    )
    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'A'))
    let staleExport!: Promise<void>
    act(() => { staleExport = result.current.exportPitchPacketFiles() })
    rerender({ scope: 'browser:B' })
    await act(async () => {
      exportedA.resolve(pitchRow('exported'))
      await staleExport
    })
    expect(downloadMock).not.toHaveBeenCalled()
    expect(result.current.packetMessage).toBeNull()

    await waitFor(() => expect(result.current.status.activeSession?.state).toBe('banked'))
    await act(async () => result.current.openPitchPacket(createEmptyDocuments(), 'B'))
    let staleRedownload!: Promise<void>
    act(() => { staleRedownload = result.current.redownloadPitchPacket() })
    rerender({ scope: 'browser:C' })
    await act(async () => {
      fetchedC.resolve(pitchRow('exported'))
      await staleRedownload
    })
    expect(downloadMock).not.toHaveBeenCalled()
    expect(result.current.packetDownloadError).toBeNull()
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
