import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryBibleTab } from '../../client/src/components/writing/StoryBibleTab'
import { defaultProjectState } from '../../client/src/lib/projectState'

describe('StoryBibleTab', () => {
  const defaultBible = defaultProjectState().storyBible
  const defaultProps = {
    onAddCharacter: vi.fn(),
    onUpdateCharacter: vi.fn(),
    onSetWorld: vi.fn(),
    onSetThemes: vi.fn(),
    onSetRules: vi.fn(),
  }

  it('renders all five section headings', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} />)
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.getByText('Themes')).toBeInTheDocument()
    expect(screen.getByText('Tone & Voice')).toBeInTheDocument()
    expect(screen.getByText('Rules of the World')).toBeInTheDocument()
  })

  it('separates specialist chips from writing prompts in section headers', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} />)
    expect(screen.getByText('How does this story feel to read?')).toBeInTheDocument()
    expect(screen.getAllByText('Casey').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Casey ·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Zoe ·/)).not.toBeInTheDocument()
  })

  it('renders Add Character button', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} />)
    expect(screen.getByText('+ Add Character')).toBeInTheDocument()
  })

  it('calls onAddCharacter when button clicked', () => {
    const onAddCharacter = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onAddCharacter={onAddCharacter} />)
    fireEvent.click(screen.getByText('+ Add Character'))
    expect(onAddCharacter).toHaveBeenCalledWith({ name: 'New Character', role: '', wound: '', want: '', need: '', arc: '' })
  })

  it('clears the whole story bible in one click when content exists', () => {
    const onClear = vi.fn()
    const bible = {
      ...defaultBible,
      world: { ...defaultBible.world, setting: 'A sealed city' },
    }

    render(<StoryBibleTab storyBible={bible} {...defaultProps} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear story bible' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('disables clear story bible when the story bible is empty', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear story bible' })).toBeDisabled()
  })

  it('renders existing characters', () => {
    const bible = {
      ...defaultBible,
      characters: [{ id: '1', name: 'Elena', role: 'Protagonist', wound: 'Lost her daughter', want: 'Justice', need: 'Forgiveness', arc: 'Learns to let go' }],
    }
    render(<StoryBibleTab storyBible={bible} {...defaultProps} />)
    expect(screen.getByDisplayValue('Elena')).toBeInTheDocument()
  })

  it('calls onSectionChange with "characters" when Characters header clicked', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Characters'))
    expect(onSectionChange).toHaveBeenCalledWith('characters')
  })

  it('calls onSectionChange with "characters" when a character field receives focus', () => {
    const onSectionChange = vi.fn()
    const bible = {
      ...defaultBible,
      characters: [{ id: '1', name: 'Elena', role: '', wound: '', want: '', need: '', arc: '' }],
    }
    render(<StoryBibleTab storyBible={bible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.focus(screen.getByPlaceholderText(/character name/i))
    expect(onSectionChange).toHaveBeenCalledWith('characters')
  })

  it('calls onSectionChange with "world" when World header clicked', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('World'))
    expect(onSectionChange).toHaveBeenCalledWith('world')
  })

  it('calls onSectionChange with "world" when the Setting field receives focus', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.focus(screen.getByPlaceholderText(/write your setting/i))
    expect(onSectionChange).toHaveBeenCalledWith('world')
  })

  it('calls onSectionChange with "themes" when Themes header clicked', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Themes'))
    expect(onSectionChange).toHaveBeenCalledWith('themes')
  })

  it('calls onSectionChange with "themes" when the Central Theme field receives focus', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.focus(screen.getByPlaceholderText(/write your central theme/i))
    expect(onSectionChange).toHaveBeenCalledWith('themes')
  })

  it('calls onSectionChange with "tone" when Tone & Voice header clicked', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Tone & Voice'))
    expect(onSectionChange).toHaveBeenCalledWith('tone')
  })

  it('calls onSectionChange with "tone" when the Voice Notes field receives focus', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.focus(screen.getByPlaceholderText(/write your voice notes/i))
    expect(onSectionChange).toHaveBeenCalledWith('tone')
  })

  it('calls onSectionChange with "rules" when Rules header clicked', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Rules of the World'))
    expect(onSectionChange).toHaveBeenCalledWith('rules')
  })

  it('calls onSectionChange with "rules" when the World Rules field receives focus', () => {
    const onSectionChange = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onSectionChange={onSectionChange} />)
    fireEvent.focus(screen.getByPlaceholderText(/write your world rules/i))
    expect(onSectionChange).toHaveBeenCalledWith('rules')
  })
})
