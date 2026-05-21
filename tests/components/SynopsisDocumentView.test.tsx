import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SynopsisDocumentView } from '../../client/src/components/writing/synopsis/SynopsisDocumentView'
import type { SynopsisDocumentContent } from '@shared/documents'
import { createEmptySynopsisContent, createEmptySeriesContent } from '@shared/documents'

function seriesContent(overrides: Partial<ReturnType<typeof createEmptySeriesContent>> = {}) {
  return { ...createEmptySeriesContent(), ...overrides }
}

const emptyContent: SynopsisDocumentContent = {
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
}

const updatedAt = '2026-05-16T10:00:00.000Z'

function withContent(patch: Partial<SynopsisDocumentContent>): SynopsisDocumentContent {
  return {
    ...emptyContent,
    ...patch,
    header: { ...emptyContent.header, ...(patch.header ?? {}) },
    logline: { ...emptyContent.logline, ...(patch.logline ?? {}) },
    prose: { ...emptyContent.prose, ...(patch.prose ?? {}) },
    qa: { ...emptyContent.qa, ...(patch.qa ?? {}) },
  }
}

describe('SynopsisDocumentView', () => {
  it('renders the title prominently when header.title is set', () => {
    render(
      <SynopsisDocumentView
        content={withContent({ header: { title: 'My Great Film', writer: '', format: '', genre: '', targetRuntime: '', comps: [] } })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Great Film')
  })

  it('renders the logline in italics when content.logline.text is set', () => {
    render(
      <SynopsisDocumentView
        content={withContent({ logline: { text: 'A hero must save the world.', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' } })}
        updatedAt={updatedAt}
      />
    )
    const logline = screen.getByText('A hero must save the world.')
    expect(logline.style.fontStyle).toBe('italic')
  })

  it('renders prose paragraphs joined with paragraph breaks', () => {
    render(
      <SynopsisDocumentView
        content={withContent({
          prose: { opening: 'First para.', escalation: 'Second para.', middle: 'Third para.', climax: 'Fourth para.', resolution: 'Fifth para.' },
        })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.getByText('First para.')).toBeInTheDocument()
    expect(screen.getByText('Second para.')).toBeInTheDocument()
    expect(screen.getByText('Third para.')).toBeInTheDocument()
    expect(screen.getByText('Fourth para.')).toBeInTheDocument()
    expect(screen.getByText('Fifth para.')).toBeInTheDocument()
  })

  it('omits metadata block entirely when both header.title and header.writer are empty', () => {
    render(
      <SynopsisDocumentView
        content={withContent({ header: { title: '', writer: '', format: 'Feature', genre: 'Drama', targetRuntime: '100', comps: ['Heat'] } })}
        updatedAt={updatedAt}
      />
    )
    // FORMAT / GENRE / RUNTIME / COMPS labels should not appear when title and writer both empty
    expect(screen.queryByText('FORMAT')).not.toBeInTheDocument()
    expect(screen.queryByText('GENRE')).not.toBeInTheDocument()
    expect(screen.queryByText('RUNTIME')).not.toBeInTheDocument()
    expect(screen.queryByText('COMPS')).not.toBeInTheDocument()
  })

  it('renders metadata block when header.title is set even if other fields are empty', () => {
    render(
      <SynopsisDocumentView
        content={withContent({ header: { title: 'Only Title', writer: '', format: '', genre: '', targetRuntime: '', comps: [] } })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.getByText('TITLE')).toBeInTheDocument()
  })

  it('renders metadata block when header.writer is set even if title is empty', () => {
    render(
      <SynopsisDocumentView
        content={withContent({ header: { title: '', writer: 'Jane Doe', format: '', genre: '', targetRuntime: '', comps: [] } })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.getByText('WRITER')).toBeInTheDocument()
  })

  it('skips empty prose paragraphs — only resolution populated renders one paragraph', () => {
    render(
      <SynopsisDocumentView
        content={withContent({
          prose: { opening: '', escalation: '', middle: '', climax: '', resolution: 'Only resolution text.' },
        })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.getByText('Only resolution text.')).toBeInTheDocument()
    // Only one <p> in the prose section (plus the footer)
    const paras = screen.getAllByText(/Only resolution text\./)
    expect(paras).toHaveLength(1)
  })

  it('renders the Last edited footer with a locale-formatted date', () => {
    render(
      <SynopsisDocumentView
        content={emptyContent}
        updatedAt={updatedAt}
      />
    )
    const expected = new Date(updatedAt).toLocaleDateString()
    expect(screen.getByText(`Last edited ${expected}`)).toBeInTheDocument()
  })

  it('renders nothing for QA — QA checklist items are not shown', () => {
    render(
      <SynopsisDocumentView
        content={withContent({
          qa: {
            protagonistNamedEarly: true,
            goalClear: true,
            obstacleClear: true,
            stakesClear: true,
            endingRevealed: true,
            paragraphsConnectCausally: true,
            toneMatchesProject: true,
            noUnnecessarySubplot: true,
          },
        })}
        updatedAt={updatedAt}
      />
    )
    expect(screen.queryByText('Protagonist named early')).not.toBeInTheDocument()
    expect(screen.queryByText('Goal clear')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not render a Copy as Markdown or export button', () => {
    render(
      <SynopsisDocumentView
        content={emptyContent}
        updatedAt={updatedAt}
      />
    )
    expect(screen.queryByText(/copy as markdown/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument()
  })

  it('branches from projectFormat instead of a stale header format mirror', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'Feature Project'
    content.header.format = 'series'
    content.prose.opening = 'Feature synopsis body.'
    content.series = seriesContent({ showOverview: 'Inactive series overview.' })

    render(
      <SynopsisDocumentView
        content={content}
        projectFormat="feature"
        updatedAt={updatedAt}
      />
    )

    expect(screen.getByText('Feature synopsis body.')).toBeInTheDocument()
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.queryByText(/show overview/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Inactive series overview.')).not.toBeInTheDocument()
  })
})

describe('SynopsisDocumentView — series mode', () => {
  it('uses projectFormat as the series authority even when header.format is stale', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'My Show'
    content.header.format = 'feature'
    content.header.targetRuntime = '100m'
    content.series = seriesContent({ showOverview: 'The active show overview.' })

    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)

    expect(screen.getByText(/^show overview$/i)).toBeTruthy()
    expect(screen.getByText('The active show overview.')).toBeTruthy()
    expect(screen.getByText('series')).toBeInTheDocument()
    expect(screen.queryByText(/100m/)).toBeNull()
  })

  it('renders the series metadata block with seriesType and episodeLength when format=series', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'My Show'
    content.header.format = 'series'
    content.series = seriesContent({ seriesType: 'limited', episodeLength: 'half_hour' })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/limited/i)).toBeTruthy()
    expect(screen.getByText(/half-hour/i)).toBeTruthy()
  })

  it('hides the RUNTIME metadata row in series mode', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'My Show'
    content.header.format = 'series'
    content.header.targetRuntime = '100m'   // populated but should not show
    content.series = seriesContent()
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.queryByText(/100m/)).toBeNull()
  })

  it('renders Show Overview when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ showOverview: 'A renewable conflict in a sealed city.' })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/show overview/i)).toBeTruthy()
    expect(screen.getByText(/renewable conflict in a sealed city/i)).toBeTruthy()
  })

  it('omits Show Overview section when empty', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ showOverview: '' })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.queryByText(/show overview/i)).toBeNull()
  })

  it('renders Pilot Synopsis with logline italic and prose paragraphs', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ pilot: { logline: 'P', prose: 'PARA1\n\nPARA2' } })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/pilot synopsis/i)).toBeTruthy()
    expect(screen.getByText('P')).toBeTruthy()
    expect(screen.getByText('PARA1')).toBeTruthy()
    expect(screen.getByText('PARA2')).toBeTruthy()
  })

  it('omits Pilot Synopsis section when both logline and prose empty', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ pilot: { logline: '', prose: '' } })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.queryByText(/pilot synopsis/i)).toBeNull()
  })

  it('renders Season One Arc when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ seasonOneArc: 'Arc text.' })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/season one arc/i)).toBeTruthy()
    expect(screen.getByText(/arc text/i)).toBeTruthy()
  })

  it('renders Where It Goes section with future seasons when any populated', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({
      futureSeasons: [
        { id: 's1', label: 'Season 2', summary: 'A.' },
        { id: 's2', label: '', summary: '' },   // skip
        { id: 's3', label: 'Season 3', summary: 'B.' },
      ],
    })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/where it goes/i)).toBeTruthy()
    expect(screen.getByText('Season 2')).toBeTruthy()
    expect(screen.getByText('Season 3')).toBeTruthy()
    expect(screen.getByText('A.')).toBeTruthy()
    expect(screen.getByText('B.')).toBeTruthy()
  })

  it('omits Where It Goes section when all future seasons are empty', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ futureSeasons: [{ id: 's1', label: '', summary: '' }] })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.queryByText(/where it goes/i)).toBeNull()
  })

  it('renders Characters section with bios and arc-per-season when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({
      characters: [
        { id: 'c1', name: 'Sara', role: 'Protagonist', bio: 'Bio text.', arcPerSeason: ['S1 arc', 'S2 arc'] },
      ],
    })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/characters/i)).toBeTruthy()
    expect(screen.getByText('Sara')).toBeTruthy()
    expect(screen.getByText('Protagonist')).toBeTruthy()
    expect(screen.getByText('Bio text.')).toBeTruthy()
    expect(screen.getByText('S1 arc')).toBeTruthy()
    expect(screen.getByText('S2 arc')).toBeTruthy()
  })

  it('omits Characters section when all character rows are empty', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({
      characters: [{ id: 'c1', name: '', role: '', bio: '', arcPerSeason: [] }],
    })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.queryByText(/^characters$/i)).toBeNull()
  })

  it('renders Comps & Why This Show Now when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent({ compsAndWhyThisShowNow: 'Like X meets Y.' })
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/comps & why this show now/i)).toBeTruthy()
    expect(screen.getByText(/like x meets y/i)).toBeTruthy()
  })

  it('falls back to feature rendering when format=series but content.series is undefined', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.header.title = 'My Show'
    content.logline.text = 'A logline.'
    content.prose.opening = 'Opening prose.'
    // intentionally no content.series
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    // Should render the feature view: title, logline, prose
    // Title appears in both h1 and metadata span, so use getAllByText
    expect(screen.getAllByText(/my show/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/a logline/i)).toBeTruthy()
    expect(screen.getByText(/opening prose/i)).toBeTruthy()
    // Should NOT render any series sections
    expect(screen.queryByText(/show overview/i)).toBeNull()
    expect(screen.queryByText(/pilot synopsis/i)).toBeNull()
  })

  it('renders the Last edited footer in series mode', () => {
    const content = createEmptySynopsisContent()
    content.header.format = 'series'
    content.series = seriesContent()
    render(<SynopsisDocumentView content={content} projectFormat="series" updatedAt="2026-05-16T12:00:00.000Z" />)
    expect(screen.getByText(/last edited/i)).toBeTruthy()
  })
})
