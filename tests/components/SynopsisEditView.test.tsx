import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SynopsisEditView } from '../../client/src/components/writing/synopsis/SynopsisEditView'
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

function defaultProps(overrides: Partial<Parameters<typeof SynopsisEditView>[0]> = {}) {
  return {
    content: emptyContent,
    composeMode: 'prose' as const,
    onContentPatch: vi.fn(),
    onComposeModeChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  }
}

describe('SynopsisEditView — rendering', () => {
  it('renders the Header, Logline, Prose, and QA sections', () => {
    render(<SynopsisEditView {...defaultProps()} />)
    // Header section (has title label)
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
    // Logline
    expect(screen.getByRole('textbox', { name: 'Logline' })).toBeInTheDocument()
    // Prose editor (prose mode shows one textarea)
    expect(screen.getByLabelText('prose editor')).toBeInTheDocument()
    // QA checklist
    expect(screen.getByText('Protagonist named early')).toBeInTheDocument()
  })
})

describe('SynopsisEditView — content patching', () => {
  it('editing the title fires onContentPatch with merged header', () => {
    const onContentPatch = vi.fn()
    render(
      <SynopsisEditView
        {...defaultProps({ onContentPatch })}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'My Film' },
    })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({ title: 'My Film' }),
      })
    )
  })

  it('editing the logline text fires onContentPatch with merged logline', () => {
    const onContentPatch = vi.fn()
    render(
      <SynopsisEditView
        {...defaultProps({ onContentPatch })}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Logline' }), {
      target: { value: 'A hero rises.' },
    })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        logline: expect.objectContaining({ text: 'A hero rises.' }),
      })
    )
  })

  it('editing a prose field fires onContentPatch with prose updated', () => {
    const onContentPatch = vi.fn()
    render(
      <SynopsisEditView
        {...defaultProps({ onContentPatch, composeMode: 'prose' })}
      />
    )
    fireEvent.change(screen.getByLabelText('prose editor'), {
      target: { value: 'Opening para.' },
    })
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prose: expect.objectContaining({ opening: 'Opening para.' }),
      })
    )
  })

  it('toggling a QA checkbox fires onContentPatch with qa updated', () => {
    const onContentPatch = vi.fn()
    render(
      <SynopsisEditView
        {...defaultProps({ onContentPatch })}
      />
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Goal clear' })
    fireEvent.click(checkbox)
    expect(onContentPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        qa: expect.objectContaining({ goalClear: true }),
      })
    )
  })

  it('compose-mode toggle fires onComposeModeChange with the other mode', () => {
    const onComposeModeChange = vi.fn()
    render(
      <SynopsisEditView
        {...defaultProps({ onComposeModeChange, composeMode: 'prose' })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /switch to paragraphs mode/i }))
    expect(onComposeModeChange).toHaveBeenCalledWith('paragraphs')
  })
})

describe('SynopsisEditView — Clear button two-click confirm', () => {
  it('first Clear click: label changes to "Click again to confirm"; onClear NOT called', () => {
    const onClear = vi.fn()
    render(<SynopsisEditView {...defaultProps({ onClear })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
    expect(screen.getByRole('button', { name: 'Click again to confirm' })).toBeInTheDocument()
    expect(onClear).not.toHaveBeenCalled()
  })

  it('second Clear click immediately fires onClear and returns label to "Clear synopsis"', () => {
    const onClear = vi.fn()
    render(<SynopsisEditView {...defaultProps({ onClear })} />)
    // First click — arm
    fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
    // Second click — confirm
    fireEvent.click(screen.getByRole('button', { name: 'Click again to confirm' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Clear synopsis' })).toBeInTheDocument()
  })

  describe('auto-cancel after ~3 seconds', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns to unarmed after 3s without confirm; onClear NOT called', () => {
      const onClear = vi.fn()
      render(<SynopsisEditView {...defaultProps({ onClear })} />)
      fireEvent.click(screen.getByRole('button', { name: 'Clear synopsis' }))
      expect(screen.getByRole('button', { name: 'Click again to confirm' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(screen.getByRole('button', { name: 'Clear synopsis' })).toBeInTheDocument()
      expect(onClear).not.toHaveBeenCalled()
    })
  })
})
