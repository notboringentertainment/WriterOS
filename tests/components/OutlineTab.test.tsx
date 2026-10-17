import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { emptyLookbook, type LookbookDocument } from '../../shared/lookbook'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

describe('OutlineTab', () => {
  const defaultDocument = defaultProjectState().documents.outline

  function baseProps(overrides: Partial<ComponentProps<typeof OutlineTab>> = {}): ComponentProps<typeof OutlineTab> {
    return {
      document: defaultDocument,
      projectFormat: 'feature',
      identity: { title: 'T', genre: 'Drama' },
      onProjectFormatChange: vi.fn(),
      onContentChange: vi.fn(),
      onViewPreferencesPatch: vi.fn(),
      onComposed: vi.fn(),
      ...overrides,
    }
  }

  function renderOutline(overrides: Partial<ComponentProps<typeof OutlineTab>> = {}) {
    const props: ComponentProps<typeof OutlineTab> = {
      document: defaultDocument,
      projectFormat: 'feature',
      identity: { title: 'T', genre: 'Drama' },
      onProjectFormatChange: vi.fn(),
      onContentChange: vi.fn(),
      onViewPreferencesPatch: vi.fn(),
      onComposed: vi.fn(),
      ...overrides,
    }

    render(<OutlineTab {...props} />)
    return props
  }

  it('shows no foundation questions or hand-written beat editor on an unlinked project', () => {
    renderOutline()

    expect(screen.getByText(/No beat sheet yet\. Beats come from this project's Story-drive beat sheet/)).toBeInTheDocument()
    expect(screen.queryByText('Who are we following?')).toBeNull()
    expect(screen.queryByText('What disrupts it?')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('has no Clear answers button', () => {
    renderOutline()
    expect(screen.queryByRole('button', { name: /clear answers/i })).toBeNull()
  })

  it('renders project format selector when format props are supplied', () => {
    renderOutline({ projectFormat: 'series' })

    expect(screen.getByLabelText(/^format$/i)).toHaveValue('series')
  })

  it('calls onProjectFormatChange when the project format selector changes', () => {
    const onProjectFormatChange = vi.fn()
    renderOutline({ projectFormat: 'feature', onProjectFormatChange })

    fireEvent.change(screen.getByLabelText(/^format$/i), { target: { value: 'series' } })

    expect(onProjectFormatChange).toHaveBeenCalledWith('series')
  })

  it('never writes to the outline just by opening a series project', async () => {
    const onContentChange = vi.fn()
    renderOutline({ projectFormat: 'series', onContentChange })

    expect(screen.queryByText('What keeps generating stories?')).toBeNull()
    expect(screen.queryByText('Episode map')).toBeNull()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(onContentChange).not.toHaveBeenCalled()
  })

  describe('Story-drive wiring', () => {
    const linked = { kind: 'unchanged' as const, ticket: 'T-1', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1 }
    const syncedDocument = {
      ...defaultDocument,
      content: {
        ...defaultDocument.content,
        units: [{ ...createOutlineUnit('sample-beat'), number: 1, title: 'Sample beat', whatHappens: 'Original text.' }],
        beatSheetSource: { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: null },
      },
    }
    const suffix = /Story-drive has changed since/

    it('turns refreshing on during the call and off after, and clears the changed-since suffix', async () => {
      const gate = deferred<void>()
      const onRefreshBeatSheet = vi.fn(() => gate.promise)
      const onCheckBeatSheetStatus = vi.fn().mockResolvedValue({ ...linked, kind: 'updated', added: [], removed: [], changed: [] })
      renderOutline({ document: syncedDocument, beatSheetStatus: linked, onRefreshBeatSheet, onCheckBeatSheetStatus })

      expect(await screen.findByText(suffix)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
      await act(async () => { gate.resolve() })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
      expect(screen.queryByText(suffix)).not.toBeInTheDocument()
    })

    it('shows a refresh failure, re-enables the button, and leaves the beats alone', async () => {
      const onRefreshBeatSheet = vi.fn().mockRejectedValue(new Error('server down'))
      renderOutline({ document: syncedDocument, beatSheetStatus: linked, onRefreshBeatSheet })

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      expect(await screen.findByText('Refresh failed: server down. Showing the last synced beats.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
      expect(screen.getByText('Original text.')).toBeInTheDocument()
    })

    describe('Lookbook wiring', () => {
      function LookbookHarness({ ask, persisted }: { ask: () => Promise<{ questions: Array<{ prompt: string }>; nothingToSee: boolean }>; persisted: { current: LookbookDocument | undefined } }) {
        const [lookbook, setLookbookState] = useState<LookbookDocument | undefined>(undefined)
        return (
          <OutlineTab
            {...baseProps({ document: syncedDocument, beatSheetStatus: linked })}
            lookbook={lookbook}
            onLookbookChange={updater => setLookbookState(current => {
              const next = updater(current ?? emptyLookbook())
              persisted.current = next
              return next
            })}
            onRequestLookbookQuestions={ask}
          />
        )
      }

      it('an ask that returns two prompts shows two answer boxes and persists them; dismiss keeps the question in the document', async () => {
        const persisted: { current: LookbookDocument | undefined } = { current: undefined }
        const ask = vi.fn().mockResolvedValue({ questions: [{ prompt: 'What is the light?' }, { prompt: 'What is on the table?' }], nothingToSee: false })
        render(<LookbookHarness ask={ask} persisted={persisted} />)

        fireEvent.click(screen.getByRole('button', { name: 'Ask Zoe what this looks like' }))
        expect(await screen.findByText('What is the light?')).toBeInTheDocument()
        expect(screen.getAllByPlaceholderText('In your own words')).toHaveLength(2)
        const stored = persisted.current!.beats['sample-beat']
        expect(stored.titleAtAsk).toBe('Sample beat')
        expect(stored.questions.map(q => q.prompt)).toEqual(['What is the light?', 'What is on the table?'])
        expect(stored.questions[0]).toMatchObject({ askedBy: 'zoe', answer: '' })
        expect(stored.questions[0].id).toMatch(/^lb_[0-9a-f]+$/)

        fireEvent.change(screen.getAllByPlaceholderText('In your own words')[0], { target: { value: 'Grey.' } })
        expect(persisted.current!.beats['sample-beat'].questions[0].answer).toBe('Grey.')

        fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0])
        expect(screen.queryByText('What is the light?')).not.toBeInTheDocument()
        const after = persisted.current!.beats['sample-beat'].questions
        expect(after).toHaveLength(2)
        expect(after[0].dismissedAt).toBeTruthy()
      })

      it('a failed ask shows the error and persists nothing', async () => {
        const persisted: { current: LookbookDocument | undefined } = { current: undefined }
        render(<LookbookHarness ask={vi.fn().mockRejectedValue(new Error('offline'))} persisted={persisted} />)

        fireEvent.click(screen.getByRole('button', { name: 'Ask Zoe what this looks like' }))
        expect(await screen.findByText(/offline/)).toBeInTheDocument()
        expect(persisted.current).toBeUndefined()
      })

      it('zero prompts records the beat and shows the nothing-to-see line', async () => {
        const persisted: { current: LookbookDocument | undefined } = { current: undefined }
        render(<LookbookHarness ask={vi.fn().mockResolvedValue({ questions: [], nothingToSee: true })} persisted={persisted} />)

        fireEvent.click(screen.getByRole('button', { name: 'Ask Zoe what this looks like' }))
        expect(await screen.findByText('Zoe found nothing to see here yet.')).toBeInTheDocument()
        expect(persisted.current!.beats['sample-beat']).toEqual({ titleAtAsk: 'Sample beat', questions: [] })
      })
    })

    it('checks status once for a linked project and never for null or not-linked', async () => {
      const check = vi.fn().mockResolvedValue(linked)
      const { unmount } = render(<OutlineTab {...baseProps({ beatSheetStatus: linked, onCheckBeatSheetStatus: check })} />)
      await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
      unmount()

      const skipped = vi.fn()
      render(<OutlineTab {...baseProps({ beatSheetStatus: null, onCheckBeatSheetStatus: skipped })} />)
      render(<OutlineTab {...baseProps({ beatSheetStatus: { kind: 'not-linked' }, onCheckBeatSheetStatus: skipped })} />)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(skipped).not.toHaveBeenCalled()
    })

    it('renders the status line without a synced beat sheet when linked', () => {
      renderOutline({ beatSheetStatus: { kind: 'no-beat-sheet' }, onRefreshBeatSheet: vi.fn() })
      expect(screen.getByRole('status')).toHaveTextContent('Linked to Story-drive, but no ratified beat sheet yet.')
      expect(screen.getByText('No beat sheet yet. Beats appear here once the beat sheet is ratified in Story-drive.')).toBeInTheDocument()
      expect(screen.queryByText('Who are we following?')).toBeNull()
    })
  })
})
