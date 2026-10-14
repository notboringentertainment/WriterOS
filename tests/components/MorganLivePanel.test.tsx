import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MorganLivePanel } from '../../client/src/components/shell/MorganLivePanel'
import type { MorganApi } from '../../client/src/lib/projectStorage'
import { hello, row, waiting } from '../helpers/morganProtocol'

function fakeApi() {
  let push: (e: unknown) => void = () => {}
  const api: MorganApi = {
    start: vi.fn(async () => ({ sessionId: 's1', existing: false })),
    submit: vi.fn(async () => 'c1'),
    answerApproval: vi.fn(async () => {}),
    answerProposal: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    stream: vi.fn((_id, onEvent) => { push = onEvent as never; return () => {} }),
  }
  return { api, push: (e: unknown) => act(() => push(e)) }
}

const onPageProposal = vi.fn()
beforeEach(() => { onPageProposal.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

async function started() {
  const f = fakeApi()
  render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
  fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
  await waitFor(() => expect(f.api.stream).toHaveBeenCalled())
  f.push({ type: 'hello', hello: hello() })
  return f
}

describe('MorganLivePanel', () => {
  it('hides only the leading routing line in user bubbles while leaving the rest of the text intact', async () => {
    const f = await started()
    const routing = '[WriterOS: Ben is on the Script page]\n'
    const message = 'Where should this scene go?\n' + routing + 'This line was quoted.'
    f.push({ type: 'events', epoch: 'e1', events: [row(0, routing + message, {
      type: 'user', role: 'user', origin: { kind: 'plugin', name: 'writeros-morgan', asUser: true },
    })] })
    const conversation = screen.getByLabelText('Morgan conversation')
    expect(conversation.textContent).toBe(message)
    f.push({ type: 'events', epoch: 'e1', events: [row(1, routing + 'Quoted by Morgan.')] })
    expect(conversation.textContent).toContain(routing + 'Quoted by Morgan.')
  })

  it('wraps long feed rows inside the rail', async () => {
    const f = await started()
    const text = '/projects/' + 'long-folder-name'.repeat(40)
    f.push({ type: 'events', epoch: 'e1', events: [row(0, text)] })
    expect(screen.getByText(text)).toHaveStyle({ overflowWrap: 'anywhere', wordBreak: 'break-word' })
  })
  it('shows Morgan\'s reply as plain text and sends what Ben types', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [row(0, 'Ready.')] })
    expect(await screen.findByText('Ready.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /message morgan/i }), { target: { value: 'Where did beat one come from?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(f.api.submit).toHaveBeenCalledWith('p1', 'Where did beat one come from?', { surface: 'Outline' }))
  })

  it('never renders model text as HTML', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [row(0, '<img src=x onerror=alert(1)>')] })
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows an approval card and sends Ben\'s answer', async () => {
    const f = await started()
    f.push({ type: 'approval', card: { requestId: 'r1', tool: 'Edit', summary: 'Edit 28.md (/x/28.md)', input: '{}' } })
    expect(await screen.findByText('Edit 28.md (/x/28.md)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^allow$/i }))
    await waitFor(() => expect(f.api.answerApproval).toHaveBeenCalledWith('p1', 'r1', { allow: true }))
    f.push({ type: 'approval-answered', requestId: 'r1', allow: true })
    await waitFor(() => expect(screen.queryByText('Edit 28.md (/x/28.md)')).toBeNull())
  })

  it('"Don\'t allow" can carry a note to Morgan', async () => {
    const f = await started()
    f.push({ type: 'approval', card: { requestId: 'r2', tool: 'Bash', summary: 'Run a command: Import beat sheet to canon', input: '{}' } })
    fireEvent.change(await screen.findByRole('textbox', { name: /tell morgan why/i }), { target: { value: 'dry run first' } })
    fireEvent.click(screen.getByRole('button', { name: /don.t allow/i }))
    await waitFor(() => expect(f.api.answerApproval).toHaveBeenCalledWith('p1', 'r2', { allow: false, note: 'dry run first' }))
  })

  it('hands page proposals to the page', async () => {
    const f = await started()
    const proposal = { surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' }
    f.push({ type: 'proposal', proposalId: 'p9', proposal })
    await waitFor(() => expect(onPageProposal).toHaveBeenCalledWith({ proposalId: 'p9', proposal }))
    expect(screen.getByText('Add rain')).toBeTruthy() // also listed in the rail, so Ben can find it
  })

  it('"New conversation" starts fresh', async () => {
    const f = await started()
    f.push({ type: 'approval', card: { requestId: 'r', tool: 'Edit', summary: 'Old approval', input: '{}' } })
    f.push({ type: 'proposal', proposalId: 'old', proposal: { surface: 'script', summary: 'Old proposal', target: { kind: 'append' }, blocks: [] } })
    f.push({ type: 'resumed', ok: true }); f.push({ type: 'truncated' })
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    await waitFor(() => expect(f.api.end).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(f.api.start).toHaveBeenLastCalledWith('p1', { fresh: true }))
    await waitFor(() => expect(screen.queryByText('Old approval')).toBeNull())
    expect(screen.queryByText('Old proposal')).toBeNull()
    expect(screen.queryByText('Picked up where you left off.')).toBeNull()
    expect(screen.queryByText('Earlier messages are not shown.')).toBeNull()
  })

  it('says plainly when Morgan is stuck, and Restart ends then starts', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [waiting(0, 'r1', 'elicitation', 'A form')] })
    expect(await screen.findByText(/stuck on a prompt this screen cannot show/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /restart morgan/i }))
    await waitFor(() => expect(f.api.end).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(f.api.start).toHaveBeenCalledTimes(2))
    expect((f.api.end as any).mock.invocationCallOrder[0]).toBeLessThan((f.api.start as any).mock.invocationCallOrder[1])
  })

  it('shows the could-not-start message with its command', async () => {
    const f = await started()
    f.push({ type: 'ended', reason: 'start-failed', code: null, message: 'Morgan could not start. … run `claude` …' })
    expect(await screen.findByText(/could not start/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /start morgan/i })).toBeTruthy()
  })

  it('shows when the session ended', async () => {
    const f = await started()
    f.push({ type: 'ended', reason: 'server-shutdown', code: null })
    expect(await screen.findByText(/session ended/i)).toBeTruthy()
  })

  it('shows the start error from the server', async () => {
    const f = fakeApi()
    ;(f.api.start as any).mockRejectedValueOnce(new Error('Morgan needs Claude Code 2.1.290 or newer.'))
    render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
    fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
    expect(await screen.findByText(/2\.1\.290/)).toBeTruthy()
  })

  it('ignores late stream events after a project switch and closes without ending', async () => {
    const streams: ((e: any) => void)[] = []
    const close = vi.fn()
    const f = fakeApi()
    vi.mocked(f.api.stream).mockImplementation((_id, push) => { streams.push(push); return close })
    const view = render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
    fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
    await waitFor(() => expect(streams).toHaveLength(1))
    act(() => { streams[0]({ type: 'approval', card: { requestId: 'r', tool: 'Edit', summary: 'Old approval', input: '{}' } }); streams[0]({ type: 'proposal', proposalId: 'old', proposal: { surface: 'script', summary: 'Old proposal', target: { kind: 'append' }, blocks: [] } }); streams[0]({ type: 'resumed', ok: true }) })
    view.rerender(<MorganLivePanel projectId="p2" morgan={f.api} surface="Script" onPageProposal={onPageProposal} />)
    act(() => { streams[0]({ type: 'hello', hello: hello() }); streams[0]({ type: 'events', epoch: 'e1', events: [row(0, 'Old project')] }) })
    expect(screen.queryByText('Old project')).toBeNull(); expect(close).toHaveBeenCalledOnce(); expect(f.api.end).not.toHaveBeenCalled()
    expect(screen.queryByText('Old approval')).toBeNull(); expect(screen.queryByText('Old proposal')).toBeNull(); expect(screen.queryByText('Picked up where you left off.')).toBeNull()
    view.unmount()
  })

  it('ignores a start result from a previous project', async () => {
    const f = fakeApi()
    let complete!: (value: { sessionId: string; existing: boolean }) => void
    vi.mocked(f.api.start).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const view = render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
    fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
    view.rerender(<MorganLivePanel projectId="p2" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
    await act(async () => complete({ sessionId: 'old', existing: false }))
    expect(f.api.stream).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: /start morgan/i })).toBeTruthy()
  })

  it('reconnects once after one second, then reports lost contact if that stream closes', async () => {
    const f = await started()
    const closed = vi.mocked(f.api.stream).mock.calls[0][2]
    vi.useFakeTimers()
    act(() => closed())
    await act(async () => { vi.advanceTimersByTime(999) })
    expect(f.api.stream).toHaveBeenCalledOnce()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(f.api.stream).toHaveBeenCalledTimes(2)
    act(() => vi.mocked(f.api.stream).mock.calls[1][2]())
    expect(screen.getByText('Lost contact with Morgan.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /start morgan/i })).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(f.api.stream).toHaveBeenCalledTimes(2)
  })

  it('does not reconnect after the session ends', async () => {
    const f = await started()
    f.push({ type: 'ended', reason: 'stopped', code: null })
    vi.useFakeTimers()
    act(() => vi.mocked(f.api.stream).mock.calls[0][2]())
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(f.api.stream).toHaveBeenCalledOnce()
  })

  it('keeps New conversation unchanged when its confirmation is declined', async () => {
    const f = await started()
    vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    expect(f.api.end).not.toHaveBeenCalled(); expect(f.api.start).toHaveBeenCalledOnce()
  })

  it('restores rejected composer text, handles Enter, Shift+Enter and IME, and stops a turn', async () => {
    const f = await started()
    f.push({ type: 'composer', update: { id: 'c1', text: 'Try this', outcome: 'not-sent', reason: 'Not ready' } })
    const input = screen.getByRole('textbox', { name: /message morgan/i })
    expect(input).toHaveValue('Try this')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }); fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(f.api.submit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(f.api.submit).toHaveBeenCalledWith('p1', 'Try this', { surface: 'Outline' }))
    f.push({ type: 'events', epoch: 'e1', events: [{ kind: 'turn', turnId: 't1', phase: 'start', seq: 0, at: 0 }] })
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    await waitFor(() => expect(f.api.stop).toHaveBeenCalledWith('p1', 't1'))
  })

  it('clears the page proposal when answered and shows resume and truncation notices', async () => {
    const f = await started()
    f.push({ type: 'resumed', ok: true }); f.push({ type: 'truncated' })
    expect(screen.getByText('Picked up where you left off.')).toBeTruthy()
    expect(screen.getByText('Earlier messages are not shown.')).toBeTruthy()
    f.push({ type: 'proposal', proposalId: 'p9', proposal: { surface: 'script', target: { kind: 'append' }, blocks: [], summary: 'Add rain' } })
    await waitFor(() => expect(onPageProposal).toHaveBeenLastCalledWith(expect.objectContaining({ proposalId: 'p9' })))
    f.push({ type: 'proposal-answered', proposalId: 'p9', outcome: 'dismissed' })
    await waitFor(() => expect(onPageProposal).toHaveBeenLastCalledWith(null))
    expect(screen.queryByText('Add rain')).toBeNull()
  })
})
