import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import type { AuthoredDocumentState, OutlineDocumentContent } from '../../shared/documents'
import type { ComposedDocument } from '../../shared/compose/types'
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
      onAddEpisode: vi.fn(),
      onEpisodeFieldChange: vi.fn(),
      onViewPreferencesPatch: vi.fn(),
      onComposed: vi.fn(),
      onClear: vi.fn(),
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
      onAddEpisode: vi.fn(),
      onEpisodeFieldChange: vi.fn(),
      onViewPreferencesPatch: vi.fn(),
      onComposed: vi.fn(),
      onClear: vi.fn(),
      ...overrides,
    }

    render(<OutlineTab {...props} />)
    return props
  }

  it('renders feature deck cards with plain-language questions', () => {
    renderOutline()

    expect(screen.getByText('Who are we following?')).toBeInTheDocument()
    expect(screen.getByText('What disrupts it?')).toBeInTheDocument()
    expect(screen.getByText('What final choice resolves the pressure?')).toBeInTheDocument()
    expect(screen.queryByText('Inciting incident')).not.toBeInTheDocument()
    expect(screen.queryByText('All-is-lost (with subplot)')).not.toBeInTheDocument()
  })

  it('calls onContentChange with the resolved card mapping when an answer changes', () => {
    const onContentChange = vi.fn()
    renderOutline({ onContentChange })

    fireEvent.change(screen.getByLabelText('Who are we following?'), {
      target: { value: 'Sara, a widowed firefighter.' },
    })

    const updater = onContentChange.mock.calls[0][0]
    expect(updater(defaultDocument.content).spine.protagonist).toBe('Sara, a widowed firefighter.')
  })

  it('shows existing document answers', () => {
    const document = {
      ...defaultDocument,
      content: {
        ...defaultDocument.content,
        spine: {
          ...defaultDocument.content.spine,
          protagonist: 'Sara, a widowed firefighter.',
        },
      },
    }

    renderOutline({ document })

    expect(screen.getByDisplayValue('Sara, a widowed firefighter.')).toBeInTheDocument()
  })

  it('opens a clear dialog and clears the whole outline', () => {
    const onClear = vi.fn()
    const document = {
      ...defaultDocument,
      content: {
        ...defaultDocument.content,
        spine: {
          ...defaultDocument.content.spine,
          theme: 'Mercy under pressure',
        },
      },
    }

    renderOutline({ document, onClear })
    fireEvent.click(screen.getByRole('button', { name: 'Clear answers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }))

    expect(onClear).toHaveBeenCalledWith({ keep: 'all' })
  })

  it('disables clear outline when the outline is empty', () => {
    renderOutline()
    expect(screen.getByRole('button', { name: 'Clear answers' })).toBeDisabled()
  })

  it('hides clear outline while Document view is selected', () => {
    const document = {
      ...defaultDocument,
      viewPreferences: { activeView: 'document' as const },
    }
    renderOutline({ document, onClear: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Clear answers' })).not.toBeInTheDocument()
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

  it('renders the series deck and seeds starter episodes on first series mount', async () => {
    const onContentChange = vi.fn()
    renderOutline({ projectFormat: 'series', onContentChange })

    expect(screen.getByText('What keeps generating stories?')).toBeInTheDocument()
    expect(screen.getByText('Episode map')).toBeInTheDocument()
    await waitFor(() => expect(onContentChange).toHaveBeenCalled())
    const seeded = onContentChange.mock.calls[0][0](defaultDocument.content)
    expect(seeded.episodes.map((episode: { label: string }) => episode.label)).toEqual([
      'Episode 101',
      'Episode 102',
      'Episode 103',
    ])
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
      expect(screen.getByText('Who are we following?')).toBeInTheDocument()
    })
  })
})

describe('OutlineTab Document View', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const identity = { title: 'T', genre: 'Drama' }
  const cleanComposed = (): ComposedDocument => ({
    schemaVersion: 1,
    generatedAt: '2026-06-06T00:00:00.000Z',
    model: 'm',
    recipeVersion: getOutlineRecipe('feature', undefined).recipeVersion,
    composerVersion: 1,
    sourceHash: computeOutlineSourceHash(syntheticOutlineFeature, 'feature', identity),
    format: 'feature',
    blocks: [
      { type: 'heading', text: 'Who We Follow' },
      {
        type: 'paragraph',
        text: 'Vera Solano fights The Meridian Group.',
        sourceFieldIds: ['spine.protagonist', 'spine.centralOpposition'],
      },
    ],
    fidelity: { status: 'clean', warnings: [] },
  })

  // Stateful harness mirroring App.tsx: persists composed + view toggle back
  // into the controlled document prop so the Document View reflects the result.
  function DocumentHarness({ projectId = 'folder-outline-1', projectScopeKey, onComposedSpy }: { projectId?: string; projectScopeKey?: string; onComposedSpy?: (value: ComposedDocument) => void }) {
    const base = defaultProjectState().documents.outline
    const [doc, setDoc] = useState<AuthoredDocumentState<OutlineDocumentContent>>({
      ...base,
      content: syntheticOutlineFeature,
      viewPreferences: { activeView: 'document' },
      composed: undefined,
    })
    return (
      <OutlineTab
        projectId={projectId}
        projectScopeKey={projectScopeKey}
        document={doc}
        projectFormat="feature"
        identity={identity}
        onProjectFormatChange={vi.fn()}
        onContentChange={vi.fn()}
        onAddEpisode={vi.fn()}
        onEpisodeFieldChange={vi.fn()}
        onClear={vi.fn()}
        onViewPreferencesPatch={(patch) =>
          setDoc((d) => ({ ...d, viewPreferences: { ...d.viewPreferences, ...patch } }))
        }
        onComposed={(composed) => { onComposedSpy?.(composed); setDoc((d) => ({ ...d, composed })) }}
      />
    )
  }

  it('shows the Compose CTA in Document View for a ready outline and composes on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: cleanComposed() }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)

    // Document View, ready + uncomposed: edit-mode card questions are gone.
    expect(screen.queryByText('Who are we following?')).not.toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /compose this beat sheet/i })
    expect(cta).toBeEnabled()

    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText('Who We Follow')).toBeInTheDocument())
    expect(screen.getByText(/Vera Solano fights The Meridian Group/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/compose-document', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).projectId).toBe('folder-outline-1')
    // Renderer purity: no labeled answer rows leak into the composed body.
    expect(screen.queryByText('Who are we following?')).not.toBeInTheDocument()
  })

  it('discloses disabled project memory from the compose receipt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        composed: cleanComposed(),
        memoryReceipt: { revision: 0, status: 'disabled', citations: [], conflictIds: [] },
      }),
    }))

    const { rerender } = render(<DocumentHarness projectId="folder-outline-1" />)
    fireEvent.click(screen.getByRole('button', { name: /compose this beat sheet/i }))

    expect(await screen.findByText(/project memory disabled/i)).toBeInTheDocument()
    rerender(<DocumentHarness projectId="folder-outline-2" />)
    expect(screen.queryByText(/project memory disabled/i)).not.toBeInTheDocument()
  })

  it('ignores project A completion after project B starts and applies only B composition', async () => {
    const pendingA = deferred<Record<string, unknown>>()
    const pendingB = deferred<Record<string, unknown>>()
    const fetchMock = vi.fn(async () => {
      const response = fetchMock.mock.calls.length === 1 ? pendingA.promise : pendingB.promise
      return { ok: true, json: async () => response }
    })
    vi.stubGlobal('fetch', fetchMock)
    const onComposed = vi.fn()
    const { rerender } = render(<DocumentHarness projectId={undefined} projectScopeKey="browser:outline-A" onComposedSpy={onComposed} />)
    fireEvent.click(screen.getByRole('button', { name: /compose this beat sheet/i }))

    rerender(<DocumentHarness projectId={undefined} projectScopeKey="browser:outline-B" onComposedSpy={onComposed} />)
    const composeB = screen.getByRole('button', { name: /compose this beat sheet/i })
    expect(composeB).toBeEnabled()
    fireEvent.click(composeB)
    await act(async () => pendingA.resolve({
      composed: cleanComposed(),
      memoryReceipt: { revision: 101, status: 'available', citations: [], conflictIds: [] },
    }))
    expect(onComposed).not.toHaveBeenCalled()
    expect(screen.queryByText(/project memory revision 101/i)).not.toBeInTheDocument()

    await act(async () => pendingB.resolve({
      composed: cleanComposed(),
      memoryReceipt: { revision: 102, status: 'available', citations: [], conflictIds: [] },
    }))
    await waitFor(() => expect(onComposed).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/project memory revision 102/i)).toBeInTheDocument()
  })

  it('ignores duplicate compose clicks while a request is already in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: cleanComposed() }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)

    const cta = screen.getByRole('button', { name: /compose this beat sheet/i })
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText('Who We Follow')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears composing and shows error/retry when the compose request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    fireEvent.click(screen.getByRole('button', { name: /compose this beat sheet/i }))

    // Does not get stuck on the composing placeholder; error + retry return.
    await waitFor(() => expect(screen.getByText(/could not compose/i)).toBeInTheDocument())
    expect(screen.queryByText('Composing…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
