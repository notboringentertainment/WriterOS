import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SynopsisDocumentView } from '../../client/src/components/writing/synopsis/SynopsisDocumentView'
import type { SynopsisDocumentContent } from '@shared/documents'

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
})
