import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisQuestionCard } from '../../client/src/components/writing/synopsis/SynopsisQuestionCard'
import {
  FEATURE_SYNOPSIS_DECK,
  SERIES_SYNOPSIS_DECK,
  synopsisProbeContent,
} from '../../client/src/lib/synopsisDeck'
import { createEmptySynopsisContent } from '@shared/documents'

function featurePrompt(id: string) {
  const p = FEATURE_SYNOPSIS_DECK.find((x) => x.id === id)
  if (!p) throw new Error(`feature prompt not found: ${id}`)
  return p
}

function seriesPrompt(id: string) {
  const p = SERIES_SYNOPSIS_DECK.find((x) => x.id === id)
  if (!p) throw new Error(`series prompt not found: ${id}`)
  return p
}

describe('SynopsisQuestionCard — headline discipline', () => {
  it('renders the question as the headline and does not render documentLabel as text', () => {
    const prompt = featurePrompt('feature-logline')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={vi.fn()}
      />,
    )
    expect(screen.getByText('Say the movie in one clean sentence.')).toBeInTheDocument()
    expect(screen.queryByText('Logline')).not.toBeInTheDocument()
  })

  it('renders the helper sentence', () => {
    const prompt = featurePrompt('feature-protagonist')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={vi.fn()}
      />,
    )
    expect(
      screen.getByText('Name them and give the one detail that makes them readable fast.'),
    ).toBeInTheDocument()
  })
})

describe('SynopsisQuestionCard — text/textarea inputs', () => {
  it('text input writes through buildSynopsisPatch with the prompt path', () => {
    const onPatch = vi.fn()
    const prompt = featurePrompt('feature-title')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={onPatch}
      />,
    )
    fireEvent.change(screen.getByLabelText('header.title'), { target: { value: 'A New Film' } })
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ header: expect.objectContaining({ title: 'A New Film' }) }))
  })

  it('textarea writes through buildSynopsisPatch for a 2-level nested path', () => {
    const onPatch = vi.fn()
    const prompt = featurePrompt('feature-resolution')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={onPatch}
      />,
    )
    fireEvent.change(screen.getByLabelText('prose.resolution'), {
      target: { value: 'She wins.' },
    })
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ prose: expect.objectContaining({ resolution: 'She wins.' }) }),
    )
  })
})

describe('SynopsisQuestionCard — composite cards', () => {
  it('renders all sub-labels for composite prompts', () => {
    const prompt = featurePrompt('feature-genre-runtime')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={vi.fn()}
      />,
    )
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.getByText('Runtime')).toBeInTheDocument()
  })

  it('series composite renders three sub-labels', () => {
    const prompt = seriesPrompt('series-genre-type-length')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={vi.fn()}
      />,
    )
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.getByText('Series type')).toBeInTheDocument()
    expect(screen.getByText('Episode length')).toBeInTheDocument()
  })
})

describe('SynopsisQuestionCard — comps input', () => {
  it('blurring with comma-separated text writes a tokenized string array', () => {
    const onPatch = vi.fn()
    const prompt = featurePrompt('feature-comps')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={onPatch}
      />,
    )
    const input = screen.getByLabelText('header.comps')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Hereditary, Pieces of a Woman' } })
    fireEvent.blur(input)
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({ comps: ['Hereditary', 'Pieces of a Woman'] }),
      }),
    )
  })
})

describe('SynopsisQuestionCard — series enum inputs', () => {
  it('series-type select writes seriesType', () => {
    const onPatch = vi.fn()
    const prompt = seriesPrompt('series-genre-type-length')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={onPatch}
      />,
    )
    fireEvent.change(screen.getByLabelText('Series type'), { target: { value: 'limited' } })
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ series: expect.objectContaining({ seriesType: 'limited' }) }),
    )
  })

  it('episode-length select writes episodeLength', () => {
    const onPatch = vi.fn()
    const prompt = seriesPrompt('series-genre-type-length')
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={synopsisProbeContent()}
        onPatch={onPatch}
      />,
    )
    fireEvent.change(screen.getByLabelText('Episode length'), { target: { value: 'half_hour' } })
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ series: expect.objectContaining({ episodeLength: 'half_hour' }) }),
    )
  })
})

describe('SynopsisQuestionCard — series enum inputs auto-init series block', () => {
  it('series-type select on a content without series block auto-inits series content', () => {
    const onPatch = vi.fn()
    const prompt = seriesPrompt('series-genre-type-length')
    const noSeriesContent = createEmptySynopsisContent()
    render(
      <SynopsisQuestionCard
        prompt={prompt}
        content={noSeriesContent}
        onPatch={onPatch}
      />,
    )
    fireEvent.change(screen.getByLabelText('Series type'), { target: { value: 'limited' } })
    const patch = onPatch.mock.calls[0][0]
    expect(patch.series.seriesType).toBe('limited')
    expect(patch.series.pilot).toEqual({ logline: '', prose: '' })
  })
})
