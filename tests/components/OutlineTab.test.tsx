import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import type { AuthoredDocumentState, OutlineDocumentContent } from '../../shared/documents'
import type { ComposedDocument } from '../../shared/compose/types'

describe('OutlineTab', () => {
  const defaultDocument = defaultProjectState().documents.outline

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
    fireEvent.click(screen.getByRole('button', { name: 'Clear outline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }))

    expect(onClear).toHaveBeenCalledWith({ keep: 'all' })
  })

  it('disables clear outline when the outline is empty', () => {
    renderOutline()
    expect(screen.getByRole('button', { name: 'Clear outline' })).toBeDisabled()
  })

  it('hides clear outline while Document view is selected', () => {
    const document = {
      ...defaultDocument,
      viewPreferences: { activeView: 'document' as const },
    }
    renderOutline({ document, onClear: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Clear outline' })).not.toBeInTheDocument()
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
    recipeVersion: getOutlineRecipe('feature').recipeVersion,
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
  function DocumentHarness() {
    const base = defaultProjectState().documents.outline
    const [doc, setDoc] = useState<AuthoredDocumentState<OutlineDocumentContent>>({
      ...base,
      content: syntheticOutlineFeature,
      viewPreferences: { activeView: 'document' },
      composed: undefined,
    })
    return (
      <OutlineTab
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
        onComposed={(composed) => setDoc((d) => ({ ...d, composed }))}
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
    const cta = screen.getByRole('button', { name: /compose this outline/i })
    expect(cta).toBeEnabled()

    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText('Who We Follow')).toBeInTheDocument())
    expect(screen.getByText(/Vera Solano fights The Meridian Group/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/compose-document', expect.objectContaining({ method: 'POST' }))
    // Renderer purity: no labeled answer rows leak into the composed body.
    expect(screen.queryByText('Who are we following?')).not.toBeInTheDocument()
  })

  it('ignores duplicate compose clicks while a request is already in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: cleanComposed() }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)

    const cta = screen.getByRole('button', { name: /compose this outline/i })
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText('Who We Follow')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears composing and shows error/retry when the compose request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    fireEvent.click(screen.getByRole('button', { name: /compose this outline/i }))

    // Does not get stuck on the composing placeholder; error + retry return.
    await waitFor(() => expect(screen.getByText(/could not compose/i)).toBeInTheDocument())
    expect(screen.queryByText('Composing…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
