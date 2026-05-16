import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SynopsisSeriesEditView } from '../../client/src/components/writing/synopsis/SynopsisSeriesEditView'
import {
  createEmptySynopsisContent,
  createEmptySeriesContent,
  type SynopsisDocumentContent,
} from '@shared/documents'

function makeContent(): SynopsisDocumentContent {
  return {
    ...createEmptySynopsisContent(),
    header: {
      title: '',
      writer: '',
      format: 'series',
      genre: '',
      targetRuntime: '',
      comps: [],
    },
    series: createEmptySeriesContent(),
  }
}

describe('SynopsisSeriesEditView — rendering', () => {
  it('renders all six series sub-sections', () => {
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText(/show overview/i)).toBeInTheDocument()
    expect(screen.getByText(/pilot logline/i)).toBeInTheDocument()
    expect(screen.getByText(/pilot synopsis/i)).toBeInTheDocument()
    expect(screen.getByText(/season one arc/i)).toBeInTheDocument()
    expect(screen.getByText(/where it goes/i)).toBeInTheDocument()
    expect(screen.getByText(/characters/i)).toBeInTheDocument()
    expect(screen.getByText(/comps & why this show now/i)).toBeInTheDocument()
  })

  it('renders header with format=series (shows Series type + Episode length rows)', () => {
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/^format$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/series type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/episode length/i)).toBeInTheDocument()
  })

  it('renders the logline textarea', () => {
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Logline' })).toBeInTheDocument()
  })

  it('does NOT render the QA checklist', () => {
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.queryByText(/protagonist named early/i)).toBeNull()
  })
})

describe('SynopsisSeriesEditView — header callbacks', () => {
  it('changing format in header patches content.header', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'feature' } })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({ format: 'feature' }),
      }),
    )
  })

  it('changing seriesType patches content.series.seriesType', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/series type/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'limited' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      series: expect.objectContaining({ seriesType: 'limited' }),
    })
  })

  it('changing episodeLength patches content.series.episodeLength', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/episode length/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'half_hour' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      series: expect.objectContaining({ episodeLength: 'half_hour' }),
    })
  })
})

describe('SynopsisSeriesEditView — patchSeries behaviour', () => {
  it('editing showOverview patches only content.series', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    // The Show Overview GuidedSection textarea has placeholder "Write your show overview…"
    const textarea = screen.getByPlaceholderText(/write your show overview/i)
    fireEvent.change(textarea, { target: { value: 'A renewable conflict.' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      series: expect.objectContaining({ showOverview: 'A renewable conflict.' }),
    })
  })

  it('editing seasonOneArc patches only content.series', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText(/write your season one arc/i)
    fireEvent.change(textarea, { target: { value: 'Season arc text.' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      series: expect.objectContaining({ seasonOneArc: 'Season arc text.' }),
    })
  })

  it('editing compsAndWhyThisShowNow patches only content.series', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText(/write your comps & why this show now/i)
    fireEvent.change(textarea, { target: { value: 'Succession meets Ted Lasso.' } })
    expect(onContentPatch).toHaveBeenCalledWith({
      series: expect.objectContaining({ compsAndWhyThisShowNow: 'Succession meets Ted Lasso.' }),
    })
  })

  it('editing logline text patches content.logline', () => {
    const onContentPatch = vi.fn()
    const content = makeContent()
    render(
      <SynopsisSeriesEditView
        content={content}
        onContentPatch={onContentPatch}
        onClear={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Logline' }), {
      target: { value: 'A story begins.' },
    })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        logline: expect.objectContaining({ text: 'A story begins.' }),
      }),
    )
  })
})

describe('SynopsisSeriesEditView — defensive undefined series', () => {
  it('does not throw when content.series is undefined', () => {
    const content = createEmptySynopsisContent() // no series field
    expect(content.series).toBeUndefined()
    expect(() => {
      render(
        <SynopsisSeriesEditView
          content={content}
          onContentPatch={vi.fn()}
          onClear={vi.fn()}
        />,
      )
    }).not.toThrow()
  })
})

describe('SynopsisSeriesEditView — two-click clear', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('first click arms the button; onClear NOT called', () => {
    const onClear = vi.fn()
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
    expect(onClear).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Click again to confirm' })).toBeInTheDocument()
  })

  it('second click fires onClear and resets to unarmed', () => {
    const onClear = vi.fn()
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Click again to confirm' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Clear synopsis' })).toBeInTheDocument()
  })

  it('auto-cancels after 3s without confirm; onClear NOT called', () => {
    const onClear = vi.fn()
    render(
      <SynopsisSeriesEditView
        content={makeContent()}
        onContentPatch={vi.fn()}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onClear).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Clear synopsis' })).toBeInTheDocument()
  })
})
