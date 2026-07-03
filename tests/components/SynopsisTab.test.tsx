import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { SynopsisTab } from '../../client/src/components/writing/SynopsisTab'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'
import { createEmptySeriesContent } from '@shared/documents'
import { syntheticSynopsisFeature } from '../fixtures/synopsis/syntheticSynopsis'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import type { ComposedDocument } from '../../shared/compose/types'

function makeDocument(
  override: Partial<SynopsisDocumentContent> = {},
  viewPreferences?: { activeView?: 'edit' | 'document' },
): AuthoredDocumentState<SynopsisDocumentContent> {
  return {
    version: 1,
    mode: 'prose',
    updatedAt: new Date('2025-01-15').toISOString(),
    content: {
      header: { title: '', writer: '', format: '', genre: '', targetRuntime: '', comps: [] },
      logline: { text: '', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' },
      prose: { opening: '', escalation: '', middle: '', climax: '', resolution: '' },
      qa: {
        protagonistNamedEarly: false,
        goalClear: false,
        obstacleClear: false,
        stakesClear: false,
        endingRevealed: false,
        paragraphsConnectCausally: false,
        toneMatchesProject: false,
        noUnnecessarySubplot: false,
      },
      ...override,
    },
    viewPreferences,
  }
}

const defaultDocument = makeDocument()

describe('SynopsisTab — page chrome', () => {
  it('renders the "Synopsis" title and the reader-facing subtitle', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
    expect(screen.getByText('Help an outside reader understand your story.')).toBeInTheDocument()
  })

  it('renders the Edit/Document view toggle', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Document' })).toBeInTheDocument()
  })

  it('renders the project format selector in the page chrome', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Format')).toBeInTheDocument()
  })

  it('defaults to Edit view (story-coach Edit View visible)', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByTestId('synopsis-story-coach-edit-view')).toBeInTheDocument()
  })

  it('renders the composed DocumentView when viewPreferences.activeView is "document"', () => {
    const doc = makeDocument({}, { activeView: 'document' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // Empty content → below-readiness composer state, not the old stored-answer render.
    expect(screen.getByText(/add a few more answers before composing your synopsis/i)).toBeInTheDocument()
    expect(screen.queryByTestId('synopsis-story-coach-edit-view')).not.toBeInTheDocument()
  })

  it('clicking Document fires onViewPreferencesPatch({ activeView: "document" })', () => {
    const onViewPreferencesPatch = vi.fn()
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={onViewPreferencesPatch}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Document' }))
    expect(onViewPreferencesPatch).toHaveBeenCalledWith({ activeView: 'document' })
  })

  it('clicking Edit fires onViewPreferencesPatch({ activeView: "edit" })', () => {
    const onViewPreferencesPatch = vi.fn()
    const doc = makeDocument({}, { activeView: 'document' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={onViewPreferencesPatch}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onViewPreferencesPatch).toHaveBeenCalledWith({ activeView: 'edit' })
  })
})

describe('SynopsisTab — story-coach Edit View', () => {
  it('feature mode renders plain-language Feature questions', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Say the movie in one clean sentence.')).toBeInTheDocument()
    expect(screen.getByText('How does it end?')).toBeInTheDocument()
  })

  it('feature mode does NOT render professional doc labels as visible Edit View text', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // documentLabels like "Logline" / "Climax" / "Resolution" must never appear as visible text.
    // (Question text, helper text, and group labels never include these strings.)
    expect(screen.queryByText('Logline')).not.toBeInTheDocument()
    expect(screen.queryByText('Climax')).not.toBeInTheDocument()
    expect(screen.queryByText('Resolution')).not.toBeInTheDocument()
  })

  it('series mode renders plain-language Series questions', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="series"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(
      screen.getByText('What world, tone, and repeatable pressure should a buyer understand first?'),
    ).toBeInTheDocument()
    expect(screen.getByText('What is the pilot in one sentence?')).toBeInTheDocument()
  })

  it('feature mode shows feature readiness checks; series mode does not', () => {
    const { rerender } = render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Can a reader name the lead early?')).toBeInTheDocument()

    rerender(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="series"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.queryByText('Can a reader name the lead early?')).not.toBeInTheDocument()
    expect(screen.getByText('Is the repeatable engine clear?')).toBeInTheDocument()
  })

  it('clear button confirms after two clicks', () => {
    const onClear = vi.fn()
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /clear synopsis/i }))
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('SynopsisTab — format authority', () => {
  it('format dropdown delegates to onProjectFormatChange without firing onContentPatch', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()
    render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="feature"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'series' } })
    expect(onProjectFormatChange).toHaveBeenCalledWith('series')
    expect(onContentPatch).not.toHaveBeenCalled()
  })

  it('selecting the same format does not fire any callback', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()
    render(
      <SynopsisTab
        document={defaultDocument}
        projectFormat="feature"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'feature' } })
    expect(onProjectFormatChange).not.toHaveBeenCalled()
    expect(onContentPatch).not.toHaveBeenCalled()
  })

  it('fallback lazy-init: flipping format to "series" with no project callback writes header + series', () => {
    const onContentPatch = vi.fn()
    const doc = makeDocument()
    expect(doc.content.series).toBeUndefined()
    render(
      <SynopsisTab
        document={doc}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'series' } })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({ format: 'series' }),
        series: expect.objectContaining({
          seriesType: 'ongoing',
          episodeLength: 'hour',
          showOverview: '',
        }),
      }),
    )
  })

  it('fallback lazy-init is idempotent when content.series already exists', () => {
    const onContentPatch = vi.fn()
    const doc = makeDocument({
      series: { ...createEmptySeriesContent(), showOverview: 'pre-existing overview' },
    })
    render(
      <SynopsisTab
        document={doc}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'series' } })
    const call = onContentPatch.mock.calls[0]?.[0]
    expect(call.header.format).toBe('series')
    expect('series' in call).toBe(false) // series content not re-seeded
  })

  it('flipping series → feature with onProjectFormatChange does NOT touch content', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()
    const doc = makeDocument({
      series: { ...createEmptySeriesContent(), showOverview: 'pre-existing' },
    })
    render(
      <SynopsisTab
        document={doc}
        projectFormat="series"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'feature' } })
    expect(onProjectFormatChange).toHaveBeenCalledWith('feature')
    expect(onContentPatch).not.toHaveBeenCalled()
  })
})

describe('SynopsisTab — Document View composer', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const identity = { title: 'Tideline', genre: 'Thriller' }
  const cleanComposed = (): ComposedDocument => ({
    schemaVersion: 1, generatedAt: '2026-06-09T00:00:00.000Z', model: 'm',
    recipeVersion: getSynopsisRecipe('feature').recipeVersion, composerVersion: 1,
    sourceHash: computeSynopsisSourceHash(syntheticSynopsisFeature, 'feature', identity),
    format: 'feature',
    blocks: [
      { type: 'heading', text: 'Logline' },
      { type: 'paragraph', text: 'Vera races a rising flood to expose Meridian.', sourceFieldIds: ['logline.text'] },
    ],
    fidelity: { status: 'clean', warnings: [] },
  })

  function DocumentHarness() {
    const [doc, setDoc] = useState<AuthoredDocumentState<SynopsisDocumentContent>>({
      ...makeDocument(),
      content: syntheticSynopsisFeature,
      viewPreferences: { activeView: 'document' },
      composed: undefined,
    })
    return (
      <SynopsisTab
        document={doc}
        projectFormat="feature"
        identity={identity}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={(patch) => setDoc((d) => ({ ...d, viewPreferences: { ...d.viewPreferences, ...patch } }))}
        onComposed={(composed) => setDoc((d) => ({ ...d, composed }))}
        onClear={vi.fn()}
      />
    )
  }

  it('shows the Compose CTA for a ready synopsis and composes on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: cleanComposed() }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    const cta = screen.getByRole('button', { name: /compose this synopsis/i })
    expect(cta).toBeEnabled()

    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText(/Vera races a rising flood to expose Meridian/)).toBeInTheDocument())
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body).surface).toBe('synopsis')
  })

  it('ignores duplicate compose clicks while a request is in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: cleanComposed() }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    const cta = screen.getByRole('button', { name: /compose this synopsis/i })
    fireEvent.click(cta)
    fireEvent.click(cta)

    await waitFor(() => expect(screen.getByText(/Vera races a rising flood to expose Meridian/)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows error/retry when the compose request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentHarness />)
    fireEvent.click(screen.getByRole('button', { name: /compose this synopsis/i }))

    await waitFor(() => expect(screen.getByText(/could not compose/i)).toBeInTheDocument())
    expect(screen.queryByText('Composing…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
