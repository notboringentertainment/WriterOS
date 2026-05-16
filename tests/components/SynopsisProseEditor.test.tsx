import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'
import { SynopsisProseEditor } from '../../client/src/components/writing/synopsis/SynopsisProseEditor'
import type { SynopsisDocumentContent } from '../../shared/documents'

type Prose = SynopsisDocumentContent['prose']

const emptyProse: Prose = {
  opening: '',
  escalation: '',
  middle: '',
  climax: '',
  resolution: '',
}

const fullProse: Prose = {
  opening: 'Para one.',
  escalation: 'Para two.',
  middle: 'Para three.',
  climax: 'Para four.',
  resolution: 'Para five.',
}

describe('SynopsisProseEditor — paragraphs mode', () => {
  it('renders all five labeled textareas', () => {
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="paragraphs"
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('opening')).toBeInTheDocument()
    expect(screen.getByLabelText('escalation')).toBeInTheDocument()
    expect(screen.getByLabelText('middle')).toBeInTheDocument()
    expect(screen.getByLabelText('climax')).toBeInTheDocument()
    expect(screen.getByLabelText('resolution')).toBeInTheDocument()
  })

  it('typing in middle field fires onValueChange with middle updated', () => {
    const onValueChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={fullProse}
        mode="paragraphs"
        onValueChange={onValueChange}
        onModeChange={vi.fn()}
      />
    )
    const middleTextarea = screen.getByLabelText('middle')
    fireEvent.change(middleTextarea, { target: { value: 'Updated middle.' } })
    expect(onValueChange).toHaveBeenCalledWith({
      ...fullProse,
      middle: 'Updated middle.',
    })
  })
})

describe('SynopsisProseEditor — prose mode', () => {
  it('renders one textarea', () => {
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
      />
    )
    const textareas = screen.getAllByRole('textbox')
    // One prose textarea + the toggle button; only one textarea
    const ta = textareas.filter(el => el.tagName === 'TEXTAREA')
    expect(ta).toHaveLength(1)
  })

  it('textarea value is all five fields joined with \\n\\n', () => {
    render(
      <SynopsisProseEditor
        value={fullProse}
        mode="prose"
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
      />
    )
    const expected = 'Para one.\n\nPara two.\n\nPara three.\n\nPara four.\n\nPara five.'
    expect(screen.getByLabelText('prose editor')).toHaveValue(expected)
  })

  it('displays text even when only resolution is populated (regression guard)', () => {
    const onlyResolution: Prose = { ...emptyProse, resolution: 'Resolution only text.' }
    render(
      <SynopsisProseEditor
        value={onlyResolution}
        mode="prose"
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('prose editor')).toHaveValue('Resolution only text.')
  })

  it('displays text even when only middle is populated (regression guard)', () => {
    const onlyMiddle: Prose = { ...emptyProse, middle: 'Middle only text.' }
    render(
      <SynopsisProseEditor
        value={onlyMiddle}
        mode="prose"
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('prose editor')).toHaveValue('Middle only text.')
  })

  it('typing one paragraph writes to opening, empties the rest', () => {
    const onValueChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={onValueChange}
        onModeChange={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('prose editor'), { target: { value: 'Only one.' } })
    expect(onValueChange).toHaveBeenCalledWith({
      opening: 'Only one.',
      escalation: '',
      middle: '',
      climax: '',
      resolution: '',
    })
  })

  it('typing two paragraphs (A\\n\\nB) writes A to opening, B to escalation, others empty', () => {
    const onValueChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={onValueChange}
        onModeChange={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('prose editor'), { target: { value: 'A\n\nB' } })
    expect(onValueChange).toHaveBeenCalledWith({
      opening: 'A',
      escalation: 'B',
      middle: '',
      climax: '',
      resolution: '',
    })
  })

  it('typing five paragraphs writes them in order to all five fields', () => {
    const onValueChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={onValueChange}
        onModeChange={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('prose editor'), {
      target: { value: 'P1\n\nP2\n\nP3\n\nP4\n\nP5' },
    })
    expect(onValueChange).toHaveBeenCalledWith({
      opening: 'P1',
      escalation: 'P2',
      middle: 'P3',
      climax: 'P4',
      resolution: 'P5',
    })
  })

  it('typing six paragraphs writes P0-P3 to first four, P4+P5 joined to resolution', () => {
    const onValueChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={onValueChange}
        onModeChange={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('prose editor'), {
      target: { value: 'P1\n\nP2\n\nP3\n\nP4\n\nP5\n\nP6' },
    })
    expect(onValueChange).toHaveBeenCalledWith({
      opening: 'P1',
      escalation: 'P2',
      middle: 'P3',
      climax: 'P4',
      resolution: 'P5\n\nP6',
    })
  })
})

describe('SynopsisProseEditor — mode toggle', () => {
  it('toggle fires onModeChange("paragraphs") when in prose mode', () => {
    const onModeChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="prose"
        onValueChange={vi.fn()}
        onModeChange={onModeChange}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onModeChange).toHaveBeenCalledWith('paragraphs')
  })

  it('toggle fires onModeChange("prose") when in paragraphs mode', () => {
    const onModeChange = vi.fn()
    render(
      <SynopsisProseEditor
        value={emptyProse}
        mode="paragraphs"
        onValueChange={vi.fn()}
        onModeChange={onModeChange}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onModeChange).toHaveBeenCalledWith('prose')
  })
})

describe('SynopsisProseEditor — round-trip lossless', () => {
  it('paragraphs → prose → paragraphs preserves every field byte-equivalent', () => {
    // Controlled wrapper that holds state and forwards changes
    function Wrapper() {
      const [value, setValue] = useState<Prose>(fullProse)
      const [mode, setMode] = useState<'prose' | 'paragraphs'>('paragraphs')
      return (
        <SynopsisProseEditor
          value={value}
          mode={mode}
          onValueChange={setValue}
          onModeChange={setMode}
        />
      )
    }

    render(<Wrapper />)

    // Toggle to prose
    fireEvent.click(screen.getByRole('button'))

    // The joined value should be in the prose textarea
    const proseTA = screen.getByLabelText('prose editor')
    const joined = proseTA.getAttribute('value') ?? (proseTA as HTMLTextAreaElement).value
    expect(joined).toBe('Para one.\n\nPara two.\n\nPara three.\n\nPara four.\n\nPara five.')

    // Simulate typing the same joined value (as if user toggled back — no change in content)
    fireEvent.change(proseTA, { target: { value: joined } })

    // Toggle back to paragraphs
    fireEvent.click(screen.getByRole('button'))

    // All five fields should be byte-equivalent to the original
    expect(screen.getByLabelText('opening')).toHaveValue('Para one.')
    expect(screen.getByLabelText('escalation')).toHaveValue('Para two.')
    expect(screen.getByLabelText('middle')).toHaveValue('Para three.')
    expect(screen.getByLabelText('climax')).toHaveValue('Para four.')
    expect(screen.getByLabelText('resolution')).toHaveValue('Para five.')
  })
})
