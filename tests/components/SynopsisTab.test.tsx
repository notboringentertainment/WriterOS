import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisTab } from '../../client/src/components/writing/SynopsisTab'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'
import { createEmptySeriesContent } from '@shared/documents'

function makeDocument(
  proseOverrides: Partial<SynopsisDocumentContent['prose']> = {},
  viewPreferences?: { activeView?: 'edit' | 'document'; synopsisComposeMode?: 'prose' | 'paragraphs' },
): AuthoredDocumentState<SynopsisDocumentContent> {
  return {
    version: 1,
    mode: 'prose',
    updatedAt: new Date('2025-01-15').toISOString(),
    content: {
      header: { title: '', writer: '', format: '', genre: '', targetRuntime: '', comps: [] },
      logline: { text: '', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' },
      prose: {
        opening: '',
        escalation: '',
        middle: '',
        climax: '',
        resolution: '',
        ...proseOverrides,
      },
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
    },
    viewPreferences,
  }
}

const defaultDocument = makeDocument()

describe('SynopsisTab', () => {
  it('renders the title "Synopsis" and subtitle', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
    expect(screen.getByText('Reader-facing story spine.')).toBeInTheDocument()
  })

  it('renders the view toggle pill with Edit and Document segments', () => {
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

  it('defaults to edit view when viewPreferences.activeView is not set', () => {
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // EditView includes the QA checklist with heading "Review"
    expect(screen.getByText('Review')).toBeInTheDocument()
  })

  it('renders DocumentView when viewPreferences.activeView is "document"', () => {
    const doc = makeDocument({}, { activeView: 'document' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // DocumentView always renders a "Last edited" footer
    expect(screen.getByText(/Last edited/)).toBeInTheDocument()
  })

  it('renders EditView when viewPreferences.activeView is "edit"', () => {
    const doc = makeDocument({}, { activeView: 'edit' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Review')).toBeInTheDocument()
  })

  it('clicking the Document toggle fires onViewPreferencesPatch({ activeView: "document" })', () => {
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

  it('clicking the Edit toggle fires onViewPreferencesPatch({ activeView: "edit" })', () => {
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

  it('opening-only → prose: heuristic picks prose mode (single prose editor textarea)', () => {
    // prose.opening is non-empty; escalation/middle/climax/resolution all empty → 'prose'
    const doc = makeDocument({ opening: 'A woman walks into a bar.' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // prose mode renders a single unified textarea with aria-label="prose editor"
    expect(screen.getByRole('textbox', { name: 'prose editor' })).toBeInTheDocument()
  })

  it('any non-opening field → paragraphs: heuristic picks paragraphs mode (Middle label visible)', () => {
    // prose.middle is non-empty → heuristic picks 'paragraphs'
    const doc = makeDocument({ middle: 'Things escalate badly.' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // paragraphs mode renders individual labeled fields; "Middle" is one of them
    expect(screen.getByText('Middle')).toBeInTheDocument()
  })

  it('resolution-only → paragraphs: regression guard for resolution-only legacy data', () => {
    const doc = makeDocument({ resolution: 'She wins in the end.' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // paragraphs mode shows all field labels including "Opening" and "Resolution"
    expect(screen.getByText('Opening')).toBeInTheDocument()
    expect(screen.getByText('Resolution')).toBeInTheDocument()
  })

  it('stored preference wins: synopsisComposeMode="prose" overrides heuristic', () => {
    // middle is set → heuristic would pick 'paragraphs', but stored pref says 'prose'
    const doc = makeDocument({ middle: 'Things escalate badly.' }, { synopsisComposeMode: 'prose' })
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // prose mode: single unified textarea; no "Middle" label visible
    expect(screen.getByRole('textbox', { name: 'prose editor' })).toBeInTheDocument()
    expect(screen.queryByText('Middle')).not.toBeInTheDocument()
  })

  it('clearing fires onClear after two-step confirmation', () => {
    const onClear = vi.fn()
    render(
      <SynopsisTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    // First click arms the confirm state
    fireEvent.click(screen.getByRole('button', { name: /clear synopsis/i }))
    // Second click confirms and fires onClear
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('SynopsisTab — format routing', () => {
  it('legacy format = "" renders feature edit view + QA checklist', () => {
    const doc = makeDocument()
    doc.content.header.format = ''
    render(
      <SynopsisTab
        document={doc}
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // Feature: QA "Protagonist named early" item is present
    expect(screen.getByText(/protagonist named early/i)).toBeTruthy()
    // No Show Overview in feature mode
    expect(screen.queryByText(/show overview/i)).toBeNull()
  })

  it('project format = "series" routes to series edit view and hides QA', () => {
    const doc = makeDocument()
    doc.content.header.format = 'feature'
    render(
      <SynopsisTab
        document={doc}
        projectFormat="series"
        onContentPatch={vi.fn()}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText(/show overview/i)).toBeTruthy()
    expect(screen.queryByText(/protagonist named early/i)).toBeNull()
  })

  it('format dropdown delegates project format changes without a second content patch', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()
    const doc = makeDocument()
    expect(doc.content.series).toBeUndefined()
    doc.content.header.format = 'feature'
    render(
      <SynopsisTab
        document={doc}
        projectFormat="feature"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // Simulate the format dropdown in the feature header firing: header.format = 'series'
    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'series' } })

    expect(onProjectFormatChange).toHaveBeenCalledWith('series')
    expect(onContentPatch).not.toHaveBeenCalled()
  })

  it('fallback lazy-init: flipping format to "series" initializes content.series when no project callback is supplied', () => {
    const onContentPatch = vi.fn()
    const doc = makeDocument()
    expect(doc.content.series).toBeUndefined()
    doc.content.header.format = 'feature'
    render(
      <SynopsisTab
        document={doc}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'series' } })

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

  it('lazy-init is idempotent: when content.series already exists, format=series patches do NOT re-init', () => {
    const onContentPatch = vi.fn()
    const doc = makeDocument()
    doc.content.header.format = 'series'
    doc.content.series = { ...createEmptySeriesContent(), showOverview: 'pre-existing overview' }
    render(
      <SynopsisTab
        document={doc}
        projectFormat="series"
        onContentPatch={onContentPatch}
        onViewPreferencesPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    // Simulate user re-selecting series in the dropdown
    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'series' } })
    const lastCall = onContentPatch.mock.calls.find(call => call[0].header?.format === 'series')
    expect(lastCall).toBeDefined()
    // If series is in the patch, it must NOT equal a fresh empty series (pre-existing data preserved)
    if (lastCall && 'series' in lastCall[0]) {
      expect(lastCall[0].series).not.toEqual(createEmptySeriesContent())
    }
  })

  it('flipping series → feature does NOT delete content.series', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()
    const doc = makeDocument()
    doc.content.header.format = 'series'
    doc.content.series = { ...createEmptySeriesContent(), showOverview: 'pre-existing' }
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
    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'feature' } })
    expect(onProjectFormatChange).toHaveBeenCalledWith('feature')
    expect(onContentPatch).not.toHaveBeenCalled()
  })
})
