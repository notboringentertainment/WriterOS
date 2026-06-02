import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import { normalizeProjectTitle } from '../../client/src/lib/projectIdentity'
import { defaultTitlePageMetadata } from '../../client/src/lib/projectState'
import { defaultScriptFactsCache, rebuildScriptFactsCache } from '../../client/src/lib/scriptFacts'
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

  it('opens and edits title page metadata from the Script toolbar', async () => {
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
    await waitFor(() => expect(screen.getByLabelText('Title page title')).toHaveFocus())
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

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Title page' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('dialog', { name: 'Title page' })).not.toBeInTheDocument()
  })

  it('keeps spaces while editing the title page title', async () => {
    function Harness() {
      const [projectTitle, setProjectTitle] = useState('')

      return (
        <ScriptTab
          projectTitle={projectTitle}
          titlePage={defaultTitlePageMetadata()}
          onProjectTitleChange={title => setProjectTitle(normalizeProjectTitle(title))}
          onTitlePageChange={vi.fn()}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Title page' }))

    const titleInput = screen.getByLabelText('Title page title')
    await waitFor(() => expect(titleInput).toHaveFocus())

    fireEvent.change(titleInput, { target: { value: 'THE' } })
    expect(titleInput).toHaveValue('THE')

    fireEvent.change(titleInput, { target: { value: 'THE ' } })
    expect(titleInput).toHaveValue('THE ')

    fireEvent.change(titleInput, { target: { value: 'THE FISHERMAN' } })
    expect(titleInput).toHaveValue('THE FISHERMAN')
    expect(screen.getByLabelText('Title page preview')).toHaveTextContent('THE FISHERMAN')
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

  it('shows current script facts when the cache matches the editor content', () => {
    const rawHtml = [
      '<p data-element-type="scene-heading">INT. ROOM - NIGHT</p>',
      '<p data-element-type="character">MAYA</p>',
    ].join('')
    const facts = rebuildScriptFactsCache(rawHtml, '2026-06-02T10:00:00.000Z')

    render(
      <ScriptTab
        initialScript={rawHtml}
        scriptFacts={facts}
        onRebuildScriptFacts={vi.fn()}
      />
    )

    const panel = screen.getByRole('complementary', { name: 'Script Facts' })
    expect(within(panel).getByText('Current')).toBeInTheDocument()
    expect(within(panel).getByText('MAYA')).toBeInTheDocument()
    expect(within(panel).getByText('INT. ROOM - NIGHT')).toBeInTheDocument()
    expect(within(panel).getByText('NIGHT')).toBeInTheDocument()
  })

  it('marks script facts stale when the editor content no longer matches the cache', () => {
    const facts = rebuildScriptFactsCache(
      '<p data-element-type="character">MAYA</p>',
      '2026-06-02T10:00:00.000Z'
    )

    render(
      <ScriptTab
        initialScript="<p data-element-type='character'>MARCUS</p>"
        scriptFacts={facts}
        onRebuildScriptFacts={vi.fn()}
      />
    )

    const panel = screen.getByRole('complementary', { name: 'Script Facts' })
    expect(within(panel).getByText('Stale')).toBeInTheDocument()
  })

  it('debounces stale hash updates after editor changes', async () => {
    let editor: Editor | undefined
    const rawHtml = '<p data-element-type="scene-heading">INT. ROOM - NIGHT</p>'
    const facts = rebuildScriptFactsCache(rawHtml, '2026-06-02T10:00:00.000Z')
    const onEditorReady = vi.fn((readyEditor: Editor) => {
      editor = readyEditor
    })

    render(
      <ScriptTab
        initialScript={rawHtml}
        scriptFacts={facts}
        onRebuildScriptFacts={vi.fn()}
        onEditorReady={onEditorReady}
      />
    )

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledOnce())
    const panel = screen.getByRole('complementary', { name: 'Script Facts' })
    expect(within(panel).getByText('Current')).toBeInTheDocument()

    act(() => {
      editor!.commands.insertContent(' CHANGED')
    })

    expect(within(panel).getByText('Current')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByText('Stale')).toBeInTheDocument(), {
      timeout: 1500,
    })
  })

  it('hides script facts in focus mode', () => {
    render(
      <ScriptTab
        focusMode
        scriptFacts={defaultScriptFactsCache()}
        onRebuildScriptFacts={vi.fn()}
      />
    )

    expect(screen.queryByRole('complementary', { name: 'Script Facts' })).not.toBeInTheDocument()
  })

  it('rebuilds script facts from the live editor snapshot before debounced persistence', async () => {
    let editor: Editor | undefined
    const onRebuildScriptFacts = vi.fn()
    const onScriptChange = vi.fn()
    const onEditorReady = vi.fn((readyEditor: Editor) => {
      editor = readyEditor
    })

    render(
      <ScriptTab
        scriptFacts={defaultScriptFactsCache()}
        onRebuildScriptFacts={onRebuildScriptFacts}
        onScriptChange={onScriptChange}
        onEditorReady={onEditorReady}
      />
    )

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledOnce())
    const persistedCallsBeforeEdit = onScriptChange.mock.calls.length

    act(() => {
      editor!.commands.insertContent('Fresh visible line')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild Script Facts' }))

    await waitFor(() => {
      const latestRebuild = onRebuildScriptFacts.mock.calls.at(-1)?.[0]
      expect(latestRebuild.rawHtml).toContain('Fresh visible line')
      expect(latestRebuild.scenes).toEqual([
        { id: 'scene-0', heading: 'Fresh visible line', index: 1 },
      ])
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
