import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VOICE_PROFILE_STORAGE_KEY } from '@shared/voiceProfile'
import App from '../../client/src/App'

describe('Voice Profile first-run gate', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('offers the Voice Profile ritual when no profile state exists', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'The story of you.' })).toBeInTheDocument()
  })

  it('skip records the state and never re-prompts on the next mount', () => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByRole('heading', { name: 'The story of you.' })).not.toBeInTheDocument()
    first.unmount()

    render(<App />)
    expect(screen.queryByRole('heading', { name: 'The story of you.' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY) ?? '{}').status).toBe('skipped')
  })

  it('does not gate when a profile state already exists', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, status: 'draft_answers', answers: { q1: 'a' }, createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T00:00:00Z',
    }))
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'The story of you.' })).not.toBeInTheDocument()
  })
})
