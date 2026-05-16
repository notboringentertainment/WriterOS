import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisTab } from '../../client/src/components/writing/SynopsisTab'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'

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
