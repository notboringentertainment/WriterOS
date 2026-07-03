import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StoryBibleTab } from '../../client/src/components/writing/StoryBibleTab'
import {
  createEmptyStoryBibleContent,
  type AuthoredDocumentState,
  type StoryBibleDocumentContent,
} from '@shared/documents'

function makeDocument(
  override: Partial<StoryBibleDocumentContent> = {},
  viewPreferences?: { migratedFromLegacyStoryBible?: boolean },
): AuthoredDocumentState<StoryBibleDocumentContent> {
  return {
    version: 1,
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
      screen.getByText('Identity, continuity, and the rules the world cannot break.'),
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

describe('StoryBibleTab - story-coach Edit View', () => {
  it('feature mode renders plain-language Feature questions', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByTestId('story-bible-story-coach-edit-view')).toBeInTheDocument()
    expect(screen.getByText('Say the project in one clean sentence.')).toBeInTheDocument()
    expect(screen.getByText('What state is the world in when we start?')).toBeInTheDocument()
  })

  it('series mode renders series-specific questions and hides feature-only prompts', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="series"
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(
      screen.getByText('What is the repeatable pressure that generates episodes?'),
    ).toBeInTheDocument()
    expect(screen.getByText("What is the pilot's central pressure?")).toBeInTheDocument()
    expect(screen.queryByText('What state is the world in when we start?')).not.toBeInTheDocument()
  })

  it('does not render professional document labels as Edit View card headlines', () => {
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.queryByText('Logline')).not.toBeInTheDocument()
    expect(screen.queryByText('World rules')).not.toBeInTheDocument()
    expect(screen.queryByText('Feature propulsion')).not.toBeInTheDocument()
  })

  it('writes a text prompt as a Story Bible document content patch', () => {
    const onContentPatch = vi.fn()
    render(
      <StoryBibleTab
        document={defaultDocument}
        projectFormat="feature"
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('cover.title'), { target: { value: 'Civic Ghosts' } })

    expect(onContentPatch).toHaveBeenCalledWith({
      cover: expect.objectContaining({ title: 'Civic Ghosts' }),
    })
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
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }))

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

    fireEvent.click(screen.getByText('The people'))

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

    fireEvent.click(screen.getByText('The world'))

    expect(onSectionChange).toHaveBeenCalledWith('world')
  })
})
