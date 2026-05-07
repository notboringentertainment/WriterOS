import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import type { Editor } from '@tiptap/core'

describe('ScriptTab', () => {
  it('renders element type toolbar', () => {
    render(<ScriptTab />)
    expect(screen.getByRole('combobox', { name: /element type/i })).toBeInTheDocument()
  })

  it('accepts onEditorReady prop and calls it with editor instance', async () => {
    const onEditorReady = vi.fn()
    render(<ScriptTab onEditorReady={onEditorReady} />)
    await new Promise(r => setTimeout(r, 200))
    expect(onEditorReady).toHaveBeenCalledOnce()
    expect(onEditorReady.mock.calls[0][0]).toBeTruthy()
  })

  it('accepts initialScript prop without error', () => {
    expect(() =>
      render(
        <ScriptTab initialScript="<p data-element-type='action'>Test content</p>" />
      )
    ).not.toThrow()
  })

  it('updates toolbar counts from initial script content', async () => {
    render(
      <ScriptTab initialScript="<p data-element-type='scene-heading'>INT. ROOM - DAY</p><p data-element-type='action'>Test content</p>" />
    )

    expect(await screen.findByText(/1 page · 5 words/i)).toBeInTheDocument()
  })

  it('accepts onScriptChange prop without error', () => {
    const onScriptChange = vi.fn()
    expect(() =>
      render(<ScriptTab onScriptChange={onScriptChange} />)
    ).not.toThrow()
  })

  it('publishes fresh script snapshots before debounced persistence', async () => {
    let editor: Editor | undefined
    const onScriptSnapshotChange = vi.fn()
    const onScriptChange = vi.fn()
    const onEditorReady = vi.fn((readyEditor: Editor) => {
      editor = readyEditor
    })

    render(
      <ScriptTab
        onEditorReady={onEditorReady}
        onScriptChange={onScriptChange}
        onScriptSnapshotChange={onScriptSnapshotChange}
      />
    )

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledOnce())
    const persistedCallsBeforeEdit = onScriptChange.mock.calls.length

    act(() => {
      editor!.commands.insertContent('Fresh visible line')
    })

    await waitFor(() => {
      const latestSnapshot = onScriptSnapshotChange.mock.calls.at(-1)?.[0]
      expect(latestSnapshot.rawHtml).toContain('Fresh visible line')
    })
    expect(onScriptChange).toHaveBeenCalledTimes(persistedCallsBeforeEdit)
  })
})
