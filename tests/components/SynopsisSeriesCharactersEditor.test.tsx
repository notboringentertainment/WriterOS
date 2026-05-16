import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisSeriesCharactersEditor } from '../../client/src/components/writing/synopsis/SynopsisSeriesCharactersEditor'
import type { SynopsisSeriesCharacter } from '../../shared/documents'

const char1: SynopsisSeriesCharacter = {
  id: 'c-1',
  name: 'Ada Lovelace',
  role: 'Protagonist',
  bio: 'A brilliant mathematician with a secret.',
  arcPerSeason: ['Discovers her power', 'Confronts her past'],
}

const char2: SynopsisSeriesCharacter = {
  id: 'c-2',
  name: 'Charles Babbage',
  role: 'Mentor',
  bio: 'Eccentric inventor.',
  arcPerSeason: [],
}

describe('SynopsisSeriesCharactersEditor', () => {
  it('renders the "Characters" section header', () => {
    render(<SynopsisSeriesCharactersEditor value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Characters')).toBeInTheDocument()
  })

  it('renders no rows but shows Add character button when value is empty', () => {
    render(<SynopsisSeriesCharactersEditor value={[]} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('textbox', { name: 'Character name' })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Add character' })).toBeInTheDocument()
  })

  it('renders all scalar fields for a populated character row', () => {
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Character name' })).toHaveValue('Ada Lovelace')
    expect(screen.getByRole('textbox', { name: 'Character role' })).toHaveValue('Protagonist')
    expect(screen.getByRole('textbox', { name: 'Character bio' })).toHaveValue('A brilliant mathematician with a secret.')
  })

  it('renders arcPerSeason entries as inputs', () => {
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={vi.fn()} />)
    const arcInputs = screen.getAllByRole('textbox', { name: /season arc/i })
    expect(arcInputs).toHaveLength(2)
    expect(arcInputs[0]).toHaveValue('Discovers her power')
    expect(arcInputs[1]).toHaveValue('Confronts her past')
  })

  it('editing name fires onChange with updated name on the right row', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1, char2]} onChange={onChange} />)
    const nameInputs = screen.getAllByRole('textbox', { name: 'Character name' })
    fireEvent.change(nameInputs[0], { target: { value: 'Ada' } })
    expect(onChange).toHaveBeenCalledWith([
      { ...char1, name: 'Ada' },
      char2,
    ])
  })

  it('editing role fires onChange with updated role', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Character role' }), {
      target: { value: 'Anti-hero' },
    })
    expect(onChange).toHaveBeenCalledWith([{ ...char1, role: 'Anti-hero' }])
  })

  it('editing bio fires onChange with updated bio', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Character bio' }), {
      target: { value: 'Updated bio.' },
    })
    expect(onChange).toHaveBeenCalledWith([{ ...char1, bio: 'Updated bio.' }])
  })

  it('editing an arcPerSeason entry fires onChange with the entry replaced at the right index', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={onChange} />)
    const arcInputs = screen.getAllByRole('textbox', { name: /season arc/i })
    fireEvent.change(arcInputs[1], { target: { value: 'Redeems herself' } })
    expect(onChange).toHaveBeenCalledWith([
      { ...char1, arcPerSeason: ['Discovers her power', 'Redeems herself'] },
    ])
  })

  it('clicking Add season arc fires onChange with arcPerSeason extended by empty string', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add season arc' }))
    expect(onChange).toHaveBeenCalledWith([
      { ...char1, arcPerSeason: ['Discovers her power', 'Confronts her past', ''] },
    ])
  })

  it('clicking Remove character drops the row from value', () => {
    const onChange = vi.fn()
    render(<SynopsisSeriesCharactersEditor value={[char1, char2]} onChange={onChange} />)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove character' })
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith([char2])
  })
})
