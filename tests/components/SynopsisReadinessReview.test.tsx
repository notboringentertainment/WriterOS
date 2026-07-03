import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisReadinessReview } from '../../client/src/components/writing/synopsis/SynopsisReadinessReview'
import { synopsisProbeContent } from '../../client/src/lib/synopsisDeck'
import { createEmptySynopsisContent } from '@shared/documents'

describe('SynopsisReadinessReview — feature', () => {
  it('renders all 8 plain-language reader checks', () => {
    render(
      <SynopsisReadinessReview format="feature" content={createEmptySynopsisContent()} />,
    )
    expect(screen.getByText('Can a reader name the lead early?')).toBeInTheDocument()
    expect(screen.getByText('Can a reader tell what the lead wants?')).toBeInTheDocument()
    expect(screen.getByText('Can a reader tell what is pushing back?')).toBeInTheDocument()
    expect(screen.getByText('Can a reader feel the cost of failure?')).toBeInTheDocument()
    expect(screen.getByText('Does the synopsis reveal the ending?')).toBeInTheDocument()
    expect(screen.getByText('Does each paragraph cause the next?')).toBeInTheDocument()
    expect(screen.getByText('Does the tone sound like the movie?')).toBeInTheDocument()
    expect(
      screen.getByText('Have you cut backstory or subplots that do not help the main read?'),
    ).toBeInTheDocument()
  })

  it('toggling a check fires onToggleFeatureCheck with the qa key and next boolean', () => {
    const onToggleFeatureCheck = vi.fn()
    render(
      <SynopsisReadinessReview
        format="feature"
        content={createEmptySynopsisContent()}
        onToggleFeatureCheck={onToggleFeatureCheck}
      />,
    )
    fireEvent.click(screen.getByLabelText('Can a reader tell what the lead wants?'))
    expect(onToggleFeatureCheck).toHaveBeenCalledWith('goalClear', true)
  })

  it('shows the stored qa boolean as the checkbox state', () => {
    const content = createEmptySynopsisContent()
    content.qa.endingRevealed = true
    render(<SynopsisReadinessReview format="feature" content={content} />)
    const cb = screen.getByLabelText('Does the synopsis reveal the ending?') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })
})

describe('SynopsisReadinessReview — series', () => {
  it('renders 6 derived series checks (no qa toggles)', () => {
    render(
      <SynopsisReadinessReview format="series" content={synopsisProbeContent()} />,
    )
    expect(screen.getByText('Can a reader understand the show in one sentence?')).toBeInTheDocument()
    expect(screen.getByText('Is the repeatable engine clear?')).toBeInTheDocument()
    expect(
      screen.getByText('Does the pilot sound like a complete first episode?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Does season one have a visible shape?')).toBeInTheDocument()
    expect(screen.getByText('Can the characters sustain recurring pressure?')).toBeInTheDocument()
    expect(screen.getByText('Does the pitch explain why this show, why now?')).toBeInTheDocument()
  })

  it('shows "looks good" when a derived check is satisfied', () => {
    const content = synopsisProbeContent()
    content.series!.showOverview = 'A renewable conflict.'
    render(<SynopsisReadinessReview format="series" content={content} />)
    const looksGood = screen.getAllByText('looks good')
    expect(looksGood.length).toBeGreaterThan(0)
  })

  it('shows "needs work" for unsatisfied checks', () => {
    render(<SynopsisReadinessReview format="series" content={synopsisProbeContent()} />)
    const needsWork = screen.getAllByText('needs work')
    expect(needsWork.length).toBeGreaterThan(0)
  })
})
