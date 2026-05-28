import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import type { Editor } from '@tiptap/core'

describe('ScriptTab', () => {
  it('renders element type toolbar', () => {
    render(<ScriptTab />)
    expect(screen.getByRole('combobox', { name: /element type/i })).toBeInTheDocument()
  })

  it('leaves vertical scrolling to the main pane so the element toolbar can stick', () => {
    render(<ScriptTab />)
    expect(screen.getByTestId('script-tab-surface')).not.toHaveStyle({ overflowX: 'auto' })
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

  it('opens and edits title page metadata from the Script toolbar', () => {
    const onProjectTitleChange = vi.fn()
    const onTitlePageChange = vi.fn()

    render(
      <ScriptTab
        projectTitle="The Salt Line"
        projectFormat="series"
        titlePage={{
          writtenBy: 'Mara Vale',
          basedOn: 'A story by Jonah Reed',
          contactInfo: 'mara@example.com\n555-0100',
          draftLabel: 'Second Draft',
          draftDate: 'May 27, 2026',
          formatDisplay: 'Limited Series',
        }}
        onProjectTitleChange={onProjectTitleChange}
        onTitlePageChange={onTitlePageChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Title page' }))

    expect(screen.getByRole('dialog', { name: 'Title page' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title page preview')).toHaveTextContent('THE SALT LINE')
    expect(screen.getByLabelText('Title page preview')).toHaveTextContent('Mara Vale')
    expect(screen.getByLabelText('Title page preview')).toHaveTextContent('Limited Series')

    fireEvent.change(screen.getByLabelText('Title page title'), {
      target: { value: 'Harbor Lights' },
    })
    expect(onProjectTitleChange).toHaveBeenCalledWith('Harbor Lights')

    fireEvent.change(screen.getByLabelText('Draft label'), {
      target: { value: 'Polish Draft' },
    })
    expect(onTitlePageChange).toHaveBeenCalledWith({ draftLabel: 'Polish Draft' })
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

  it('requires confirmation before replacing existing script with an FDX import', async () => {
    const onReplaceFdx = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { getByTestId } = render(
      <ScriptTab
        initialScript="<p data-element-type='action'>Existing pages</p>"
        onReplaceFdx={onReplaceFdx}
      />
    )
    const file = new File(['<FinalDraft />'], 'Replacement.fdx', { type: 'application/xml' })

    fireEvent.click(screen.getByRole('button', { name: 'Replace .fdx' }))
    fireEvent.change(getByTestId('script-fdx-replace-input'), {
      target: { files: [file] },
    })

    expect(confirmSpy).toHaveBeenCalled()
    expect(onReplaceFdx).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.change(getByTestId('script-fdx-replace-input'), {
      target: { files: [file] },
    })

    expect(onReplaceFdx).toHaveBeenCalledWith(file)
    confirmSpy.mockRestore()
  })

  it('does not ask for replacement confirmation when the script is blank', () => {
    const onReplaceFdx = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { getByTestId } = render(<ScriptTab onReplaceFdx={onReplaceFdx} />)
    const file = new File(['<FinalDraft />'], 'First Draft.fdx', { type: 'application/xml' })

    fireEvent.change(getByTestId('script-fdx-replace-input'), {
      target: { files: [file] },
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onReplaceFdx).toHaveBeenCalledWith(file)
    confirmSpy.mockRestore()
  })

  it('imports from Script as a new project without replacement confirmation', () => {
    const onImportFdx = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { getByTestId } = render(
      <ScriptTab
        initialScript="<p data-element-type='action'>Existing pages</p>"
        onImportFdx={onImportFdx}
      />
    )
    const file = new File(['<FinalDraft />'], 'New Project.fdx', { type: 'application/xml' })

    fireEvent.click(screen.getByRole('button', { name: 'Import .fdx' }))
    fireEvent.change(getByTestId('script-fdx-import-input'), {
      target: { files: [file] },
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onImportFdx).toHaveBeenCalledWith(file)
    confirmSpy.mockRestore()
  })

  it('surfaces import warnings after a successful import', () => {
    render(
      <ScriptTab
        importWarnings={['Unknown Final Draft paragraph type "New Act" imported as Action.']}
      />
    )

    expect(screen.getByText('1 import warning')).toBeInTheDocument()
    expect(screen.getByText('Unknown Final Draft paragraph type "New Act" imported as Action.')).toBeInTheDocument()
  })
})
