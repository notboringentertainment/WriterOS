import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisStoryCoachEditView } from '../../client/src/components/writing/synopsis/SynopsisStoryCoachEditView'
import { synopsisProbeContent } from '../../client/src/lib/synopsisDeck'
import { createEmptySynopsisContent } from '@shared/documents'

describe('SynopsisStoryCoachEditView — feature deck', () => {
  it('renders feature group headings', () => {
    render(
      <SynopsisStoryCoachEditView
        format="feature"
        content={createEmptySynopsisContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('The page')).toBeInTheDocument()
    expect(screen.getByText('The promise')).toBeInTheDocument()
    expect(screen.getByText('The story')).toBeInTheDocument()
  })

  it('renders all 15 feature deck question cards', () => {
    const { container } = render(
      <SynopsisStoryCoachEditView
        format="feature"
        content={createEmptySynopsisContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('[data-testid^="synopsis-question-feature-"]')).toHaveLength(15)
  })
})

describe('SynopsisStoryCoachEditView — series deck', () => {
  it('renders series group headings', () => {
    render(
      <SynopsisStoryCoachEditView
        format="series"
        content={synopsisProbeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('The show')).toBeInTheDocument()
    expect(screen.getByText('The pilot')).toBeInTheDocument()
    expect(screen.getByText('The season')).toBeInTheDocument()
    expect(screen.getByText('The future')).toBeInTheDocument()
    expect(screen.getByText('The people')).toBeInTheDocument()
    expect(screen.getByText('The read')).toBeInTheDocument()
  })

  it('renders all 11 series deck question cards', () => {
    const { container } = render(
      <SynopsisStoryCoachEditView
        format="series"
        content={synopsisProbeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('[data-testid^="synopsis-question-series-"]')).toHaveLength(11)
  })
})

describe('SynopsisStoryCoachEditView — clear', () => {
  it('two-click clear fires onClear once', () => {
    const onClear = vi.fn()
    render(
      <SynopsisStoryCoachEditView
        format="feature"
        content={createEmptySynopsisContent()}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /clear synopsis/i }))
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('first click only does not fire onClear', () => {
    const onClear = vi.fn()
    render(
      <SynopsisStoryCoachEditView
        format="feature"
        content={createEmptySynopsisContent()}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /clear synopsis/i }))
    expect(onClear).not.toHaveBeenCalled()
  })
})

describe('SynopsisStoryCoachEditView — feature qa toggle wiring', () => {
  it('toggling a feature reader-check writes qa via onContentPatch', () => {
    const onContentPatch = vi.fn()
    render(
      <SynopsisStoryCoachEditView
        format="feature"
        content={createEmptySynopsisContent()}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByLabelText('Can a reader name the lead early?'))
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({ qa: expect.objectContaining({ protagonistNamedEarly: true }) }),
    )
  })
})
