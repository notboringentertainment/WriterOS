import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryBibleLocksEditor } from '../../client/src/components/writing/storyBible/StoryBibleLocksEditor'
import type { StoryLock } from '../../shared/documents'

const lock1: StoryLock = {
  id: 'lock-1',
  statement: 'The protagonist goes to space in Act 3',
  scope: 'story',
  rationale: 'The whole third act depends on the launch.',
  source: 'Ben, initial pitch',
  status: 'active',
  createdAt: '2026-07-02T00:00:00.000Z',
}

const lock2: StoryLock = {
  id: 'lock-2',
  statement: 'The ending is bittersweet, never triumphant',
  scope: 'ending',
  rationale: '',
  source: '',
  status: 'retired',
  createdAt: '2026-07-01T00:00:00.000Z',
}

describe('StoryBibleLocksEditor', () => {
  it('shows an empty state and an add button when there are no locks', () => {
    render(<StoryBibleLocksEditor value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('No locks yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a lock' })).toBeInTheDocument()
  })

  it('renders the fields of a populated lock', () => {
    render(<StoryBibleLocksEditor value={[lock1]} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Lock statement' })).toHaveValue(lock1.statement)
    expect(screen.getByRole('combobox', { name: 'Lock scope' })).toHaveValue('story')
    expect(screen.getByRole('textbox', { name: 'Lock rationale' })).toHaveValue(lock1.rationale)
    expect(screen.getByRole('textbox', { name: 'Lock source' })).toHaveValue(lock1.source)
  })

  it('clicking Add a lock appends a new active lock with an id and createdAt', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a lock' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as StoryLock[]
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(lock1)
    expect(next[1].status).toBe('active')
    expect(next[1].scope).toBe('story')
    expect(next[1].id).toBeTruthy()
    expect(typeof next[1].createdAt).toBe('string')
    expect(next[1].createdAt).toBeTruthy()
  })

  it('editing the statement fires onChange with the updated lock', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock1]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Lock statement' }), {
      target: { value: 'New statement' },
    })
    expect(onChange).toHaveBeenCalledWith([{ ...lock1, statement: 'New statement' }])
  })

  it('changing the scope fires onChange with the updated lock', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock1]} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Lock scope' }), {
      target: { value: 'ending' },
    })
    expect(onChange).toHaveBeenCalledWith([{ ...lock1, scope: 'ending' }])
  })

  it('clicking Retire flips an active lock to retired', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }))
    expect(onChange).toHaveBeenCalledWith([{ ...lock1, status: 'retired' }])
  })

  it('clicking Reactivate flips a retired lock back to active', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock2]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    expect(onChange).toHaveBeenCalledWith([{ ...lock2, status: 'active' }])
  })

  it('marks a retired lock visibly', () => {
    render(<StoryBibleLocksEditor value={[lock2]} onChange={vi.fn()} />)
    expect(screen.getByText('Retired')).toBeInTheDocument()
  })

  it('removing a lock requires confirmation, then drops it', () => {
    const onChange = vi.fn()
    render(<StoryBibleLocksEditor value={[lock1, lock2]} onChange={onChange} />)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeButtons[0])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    expect(onChange).toHaveBeenCalledWith([lock2])
  })
})
