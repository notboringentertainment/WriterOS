import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { StoryBibleTab } from '../../client/src/components/writing/StoryBibleTab'
import {
  createEmptyStoryBibleContent,
  type AuthoredDocumentState,
  type StoryBibleDocumentContent,
} from '@shared/documents'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '@shared/projectMemory'

function makeDocument(
  override: Partial<StoryBibleDocumentContent> = {},
  viewPreferences?: { migratedFromLegacyStoryBible?: boolean },
): AuthoredDocumentState<StoryBibleDocumentContent> {
  return {
    version: 1,
    revision: 0,
    mode: 'development',
    updatedAt: new Date('2026-05-18T12:00:00.000Z').toISOString(),
    content: {
      ...createEmptyStoryBibleContent(),
      ...override,
    },
    viewPreferences,
  }
}

const defaultDocument = makeDocument({}, { migratedFromLegacyStoryBible: true })

function character(id: string, name: string): StoryBibleDocumentContent['characters'][number] {
  return {
    id, name, role: '', want: '', need: '', flaw: '', secret: '', contradiction: '', arc: '',
    relationshipPressure: '', behavioralAnchors: '', speechPatterns: '', neverWriteThemAs: '', continuityFacts: '',
  }
}

function record(input: { id: string; kind: ProjectMemoryRecord['kind']; status: ProjectMemoryRecord['status']; claim: string; source?: Partial<ProjectMemoryRecord['source']> }): ProjectMemoryRecord {
  return {
    id: input.id, projectId: 'p1', kind: input.kind, status: input.status, claim: input.claim,
    tags: [], entities: [], safety: 'clear', spoiler: false, supersedes: [], evidence: [],
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    source: { workflow: 'writeros', sourceId: input.id, sourceUri: `writeros:${input.id}`, capturedAt: '2026-10-01T00:00:00.000Z', approval: 'none', ...input.source } as ProjectMemoryRecord['source'],
  }
}

function snapshotWith(records: ProjectMemoryRecord[]): ProjectMemorySnapshot {
  return { records, conflicts: [] } as unknown as ProjectMemorySnapshot
}

describe('StoryBibleTab - page chrome', () => {
  it('renders the Story Bible surface name and reader-facing subtitle', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText('Story Bible')).toBeInTheDocument()
    expect(
      screen.getByText("Your story's facts in your words. Morgan reads this before she writes a page."),
    ).toBeInTheDocument()
  })

  it('renders the project format selector in the page chrome', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="series"
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Format')).toHaveValue('series')
  })

  it('calls onMigrateLegacyStoryBible once when the migration guard is absent', async () => {
    const onMigrateLegacyStoryBible = vi.fn()
    render(
      <StoryBibleTab
        document={makeDocument()}
        onContentPatch={vi.fn()}
        onMigrateLegacyStoryBible={onMigrateLegacyStoryBible}
        onClear={vi.fn()}
      />,
    )

    await waitFor(() => expect(onMigrateLegacyStoryBible).toHaveBeenCalledTimes(1))
  })

  it('does not run migration when migratedFromLegacyStoryBible is already true', async () => {
    const onMigrateLegacyStoryBible = vi.fn()
    render(
      <StoryBibleTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onMigrateLegacyStoryBible={onMigrateLegacyStoryBible}
        onClear={vi.fn()}
      />,
    )

    await waitFor(() => expect(onMigrateLegacyStoryBible).not.toHaveBeenCalled())
  })
})

describe('StoryBibleTab - sections view', () => {
  it('shows the six sections, each empty one as "Not written yet"', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByTestId('story-bible-sections-view')).toBeInTheDocument()
    for (const title of ['The story', 'Tone and style', 'World and rules', 'People', 'Story engine', 'Always true']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getAllByText('Not written yet.')).toHaveLength(5)
  })

  it('shows written text under its section with a plain label', () => {
    const document = makeDocument({
      onePagePitch: { ...createEmptyStoryBibleContent().onePagePitch, logline: 'A tow driver learns the depot was paid off.' },
    }, { migratedFromLegacyStoryBible: true })
    render(<StoryBibleTab document={document} onContentPatch={vi.fn()} onClear={vi.fn()} />)

    const story = screen.getByTestId('story-bible-section-story')
    expect(story).toHaveTextContent('In one sentence')
    expect(story).toHaveTextContent('A tow driver learns the depot was paid off.')
  })

  it('shows only the format\'s engine fields, plus any other field that already has text', () => {
    const series = render(<StoryBibleTab document={defaultDocument} projectFormat="series" onContentPatch={vi.fn()} onClear={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('story-bible-section-engine')).getByRole('button', { name: 'Write it yourself' }))
    expect(screen.getByLabelText('What generates episodes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Where the story starts')).not.toBeInTheDocument()
    series.unmount()

    const document = makeDocument({
      storyEngine: { ...createEmptyStoryBibleContent().storyEngine, seriesEngine: 'A new wreck every night.' },
    }, { migratedFromLegacyStoryBible: true })
    render(<StoryBibleTab document={document} projectFormat="feature" onContentPatch={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByTestId('story-bible-section-engine')).toHaveTextContent('A new wreck every night.')
  })

  it('edits a field inline as a Story Bible content patch', () => {
    const onContentPatch = vi.fn()
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )

    fireEvent.click(within(screen.getByTestId('story-bible-section-story')).getByRole('button', { name: 'Write it yourself' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Civic Ghosts' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      cover: expect.objectContaining({ title: 'Civic Ghosts' }),
    })
  })

  it('keeps typed text in a list box, and saves one item per line on leaving it', () => {
    const onContentPatch = vi.fn()
    render(<StoryBibleTab document={defaultDocument} onContentPatch={onContentPatch} onClear={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('story-bible-section-tone')).getByRole('button', { name: 'Write it yourself' }))
    const box = screen.getByLabelText('Compare it to (one per line)')
    fireEvent.change(box, { target: { value: 'Ray Donovan: the fixer, plus family\n' } })
    expect(box).toHaveValue('Ray Donovan: the fixer, plus family\n')
    expect(onContentPatch).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: 'Ray Donovan: the fixer, plus family\nAlien' } })
    fireEvent.blur(box)
    expect(onContentPatch).toHaveBeenCalledWith({ toneAndStyle: expect.objectContaining({ comps: ['Ray Donovan: the fixer, plus family', 'Alien'] }) })
  })

  it('shows and edits the Story Bible stage', () => {
    const onContentPatch = vi.fn()
    const document = makeDocument({ cover: { ...createEmptyStoryBibleContent().cover, status: 'production' } }, { migratedFromLegacyStoryBible: true })
    render(<StoryBibleTab document={document} onContentPatch={onContentPatch} onClear={vi.fn()} />)

    const story = screen.getByTestId('story-bible-section-story')
    expect(story).toHaveTextContent('Stage')
    expect(story).toHaveTextContent('In production')
    fireEvent.click(within(story).getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'living_canon' } })
    expect(onContentPatch).toHaveBeenCalledWith({ cover: expect.objectContaining({ status: 'living_canon' }) })
  })

  it('shows a sequence map entry that has only its unit name', () => {
    const document = makeDocument({ episodeOrSequenceMap: [{ id: 'm1', unit: 'Sequence 3', title: '', storyEvents: '' }] }, { migratedFromLegacyStoryBible: true })
    render(<StoryBibleTab document={document} onContentPatch={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByTestId('story-bible-section-engine')).toHaveTextContent('Sequence 3')
  })

  it('asks Morgan to fill an empty section', async () => {
    const onAskMorgan = vi.fn().mockResolvedValue(undefined)
    render(<StoryBibleTab document={defaultDocument} onContentPatch={vi.fn()} onClear={vi.fn()} onAskMorgan={onAskMorgan} />)

    fireEvent.click(within(screen.getByTestId('story-bible-section-world')).getByRole('button', { name: 'Ask Morgan' }))
    await waitFor(() => expect(onAskMorgan).toHaveBeenCalledWith(expect.stringContaining('"World and rules"')))
    expect(onAskMorgan.mock.calls[0][0]).toContain('storyBible')
  })

  it('lists the ledger\'s active open questions under "Still open"', async () => {
    const onAskMorgan = vi.fn().mockResolvedValue(undefined)
    render(<StoryBibleTab document={defaultDocument} onContentPatch={vi.fn()} onClear={vi.fn()}
      onAskMorgan={onAskMorgan} snapshot={snapshotWith([
        record({ id: 'q-open', kind: 'open_question', status: 'active', claim: 'Whether the owner appears on screen' }),
        record({ id: 'q-old', kind: 'open_question', status: 'superseded', claim: 'An answered question' }),
      ])} />)

    const open = screen.getByRole('region', { name: 'Still open' })
    expect(open).toHaveTextContent('Whether the owner appears on screen')
    expect(open).not.toHaveTextContent('An answered question')
    fireEvent.click(within(open).getByRole('button', { name: 'Ask Morgan' }))
    await waitFor(() => expect(onAskMorgan).toHaveBeenCalledWith(expect.stringContaining('Whether the owner appears on screen')))
  })

  it('shows a canon look on its person, read-only', () => {
    const document = makeDocument({ characters: [character('c1', 'Ace Handler')] }, { migratedFromLegacyStoryBible: true })
    render(<StoryBibleTab document={document} onContentPatch={vi.fn()} onClear={vi.fn()}
      snapshot={snapshotWith([record({
        id: 'look-ace', kind: 'canon', status: 'active', claim: 'Early forties, charcoal overcoat.',
        source: { workflow: 'story-wayfinder', sourceId: 'resolved/look-character-ace-handler.md' },
      })])} />)

    expect(screen.getByTestId('story-bible-character-look')).toHaveTextContent('Settled in Story-drive. Early forties, charcoal overcoat.')
  })

  it('character list adds, opens, edits, and two-click removes a character', () => {
    const onContentPatch = vi.fn()
    const document = makeDocument({
      characters: [
        {
          id: 'c1',
          name: 'Elena',
          role: 'Lead',
          want: '',
          need: '',
          flaw: '',
          secret: '',
          contradiction: '',
          arc: '',
          relationshipPressure: '',
          behavioralAnchors: '',
          speechPatterns: '',
          neverWriteThemAs: '',
          continuityFacts: '',
        },
      ],
    }, { migratedFromLegacyStoryBible: true })

    render(
      <StoryBibleTab
        document={document}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.change(screen.getByLabelText('What do they want?'), {
      target: { value: 'Expose the council' },
    })
    expect(onContentPatch).toHaveBeenCalledWith({
      characters: [
        expect.objectContaining({
          id: 'c1',
          want: 'Expose the council',
        }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onContentPatch).not.toHaveBeenCalledWith({ characters: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    expect(onContentPatch).toHaveBeenCalledWith({ characters: [] })
  })

  it('clear button confirms after two clicks', () => {
    const onClear = vi.fn()
    render(
      <StoryBibleTab
        document={defaultDocument}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /clear story bible/i }))
    fireEvent.click(screen.getByRole('button', { name: /click again to clear/i }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('StoryBibleTab - format authority', () => {
  it('format dropdown delegates to onProjectFormatChange without firing onContentPatch', () => {
    const onContentPatch = vi.fn()
    const onProjectFormatChange = vi.fn()

    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
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
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onProjectFormatChange={onProjectFormatChange}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'feature' } })

    expect(onProjectFormatChange).not.toHaveBeenCalled()
    expect(onContentPatch).not.toHaveBeenCalled()
  })

  it('fallback format change only mirrors cover.format when no project callback is supplied', () => {
    const onContentPatch = vi.fn()

    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'series' } })

    expect(onContentPatch).toHaveBeenCalledWith({
      cover: expect.objectContaining({ format: 'series' }),
    })
  })
})

describe('StoryBibleTab - section routing', () => {
  it('maps People focus to the characters section', () => {
    const onSectionChange = vi.fn()

    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onSectionChange={onSectionChange}
        onClear={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('heading', { name: 'People' }))

    expect(onSectionChange).toHaveBeenCalledWith('characters')
  })

  it('maps World focus to the world section', () => {
    const onSectionChange = vi.fn()

    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onSectionChange={onSectionChange}
        onClear={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('heading', { name: 'World and rules' }))

    expect(onSectionChange).toHaveBeenCalledWith('world')
  })
})
