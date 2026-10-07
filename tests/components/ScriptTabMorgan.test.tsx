import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import type { ScriptProposal } from '../../client/src/lib/scriptProposal'

const initialScript = '<p data-element-type="scene-heading">INT. ROOM - DAY</p><p data-element-type="action">Quiet.</p>'
const proposal: ScriptProposal = { surface: 'script', summary: 'Add a closing beat', target: { kind: 'append' }, blocks: [{ type: 'action', text: '<b>Rain.</b>' }] }
const pending = { projectId: 'p1', proposalId: 'proposal-1', proposal }
describe('Script Morgan proposals', () => {
  it('previews plain text and Keep applies to the real editor and reports kept', async () => {
    let editor: Editor | undefined
    const outcome = vi.fn()
    render(<ScriptTab projectId="p1" initialScript={initialScript} morganProposal={pending} onMorganProposalOutcome={outcome} onEditorReady={e => { editor = e }} />)
    await waitFor(() => expect(editor).toBeTruthy())
    const banner = screen.getByRole('article', { name: 'Morgan script proposal' })
    expect(banner).toHaveTextContent('<b>Rain.</b>')
    expect(banner.querySelector('b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(editor!.state.doc.lastChild?.textContent).toBe('<b>Rain.</b>')
    expect(outcome).toHaveBeenCalledWith('kept')
    expect(screen.queryByRole('article', { name: 'Morgan script proposal' })).toBeNull()
  })
  it('Dismiss leaves the script unchanged', async () => {
    let editor: Editor | undefined
    const outcome = vi.fn()
    render(<ScriptTab projectId="p1" initialScript={initialScript} morganProposal={pending} onMorganProposalOutcome={outcome} onEditorReady={e => { editor = e }} />)
    await waitFor(() => expect(editor).toBeTruthy())
    const before = editor!.getJSON()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(outcome).toHaveBeenCalledWith('dismissed')
    expect(editor!.getJSON()).toEqual(before)
  })
  it('persists Keep synchronously before its outcome even when immediately unmounted', async () => {
    let editor: Editor | undefined
    const onScriptChange = vi.fn()
    const callsAtOutcome: number[] = []
    const outcome = vi.fn(() => { callsAtOutcome.push(onScriptChange.mock.calls.length) })
    const sceneProposal = { ...pending, proposal: { ...proposal, blocks: [{ type: 'scene-heading' as const, text: 'EXT. YARD - DAY' }, { type: 'action' as const, text: 'Rain.' }] } }
    const { unmount } = render(<ScriptTab projectId="p1" initialScript={initialScript} morganProposal={sceneProposal} onScriptChange={onScriptChange} onMorganProposalOutcome={outcome} onEditorReady={e => { editor = e }} />)
    await waitFor(() => expect(editor).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    unmount()
    expect(outcome).toHaveBeenCalledWith('kept')
    expect(callsAtOutcome).toEqual([1])
    expect(onScriptChange).toHaveBeenCalledWith(expect.stringContaining('Rain.'), [
      { id: 'scene-0', heading: 'INT. ROOM - DAY', index: 1 },
      { id: 'scene-1', heading: 'EXT. YARD - DAY', index: 2 },
    ])
  })
  it('keeps a stale banner visible after reporting stale until dismissed', async () => {
    const outcome = vi.fn()
    const p = { ...pending, proposal: { ...proposal, target: { kind: 'replace-scene' as const, sceneHeading: 'EXT. YARD - DAY', expectedScene: [] } } }
    let editor: Editor | undefined
    render(<ScriptTab projectId="p1" initialScript={initialScript} morganProposal={p} onMorganProposalOutcome={outcome} onEditorReady={e => { editor = e }} />)
    await waitFor(() => expect(editor).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(outcome).toHaveBeenCalledWith('stale')
    expect(screen.getByRole('alert')).toHaveTextContent('The script changed since Morgan read it')
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(outcome).toHaveBeenLastCalledWith('dismissed')
  })
  it('hides a proposal when the open project changes without reporting an outcome', () => {
    const outcome = vi.fn()
    const { rerender } = render(<ScriptTab projectId="p1" morganProposal={pending} onMorganProposalOutcome={outcome} />)
    expect(screen.getByRole('article', { name: 'Morgan script proposal' })).toBeInTheDocument()
    rerender(<ScriptTab projectId="p2" morganProposal={pending} onMorganProposalOutcome={outcome} />)
    expect(screen.queryByRole('article', { name: 'Morgan script proposal' })).toBeNull()
    expect(outcome).not.toHaveBeenCalled()
  })
  it('keeps an ambiguous scene unchanged and explains why', async () => {
    const outcome = vi.fn()
    const p = { ...pending, proposal: { ...proposal, target: { kind: 'replace-scene' as const, sceneHeading: 'INT. ROOM - DAY', expectedScene: [{ type: 'scene-heading' as const, text: 'INT. ROOM - DAY' }, { type: 'action' as const, text: 'Quiet.' }] } } }
    let editor: Editor | undefined
    render(<ScriptTab projectId="p1" initialScript={initialScript + initialScript} morganProposal={p} onMorganProposalOutcome={outcome} onEditorReady={e => { editor = e }} />)
    await waitFor(() => expect(editor).toBeTruthy())
    const before = editor!.getJSON()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(editor!.getJSON()).toEqual(before)
    expect(outcome).toHaveBeenCalledWith('stale')
    expect(screen.getByRole('alert')).toHaveTextContent('That scene heading appears more than once with the same text')
  })
})
