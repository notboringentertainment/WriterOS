import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VOICE_PROFILE_STORAGE_KEY } from '@shared/voiceProfile'
import { VoiceProfileRitualPage } from '../../client/src/components/ritual/VoiceProfileRitualPage'

const profileDoc = {
  version: 1,
  createdAt: '2026-07-09T00:00:00Z',
  updatedAt: '2026-07-09T00:00:00Z',
  archetype: 'The Honest Cartographer',
  coreStatement: 'Maps grief with dark humor.',
  creativeNorthStars: ['Truth over comfort'],
  storytellingDNA: { principles: ['Earn the ending'], recurringThemes: ['Grief'], notes: '' },
  influences: { writers: ['Sheridan'], directors: [], filmsAndShows: [], scenesAndLines: [], notes: '' },
  characterInstincts: { drawnTo: ['Stubborn survivors'], rejects: ['Sanitized heroes'], notes: '' },
  dialogue: { rules: ['Subtext first'], instinctsByMode: 'Sparse under pressure', avoidances: ['Exposition dumps'] },
  visualLanguage: { instincts: ['Hands tell the story'], notes: '' },
  process: { whenFlowing: 'Long morning runs', stuckPatterns: ['Overplotting'], supportNeeds: ['Blunt notes'] },
  strengths: ['Voice'],
  growthEdges: ['Act two sag'],
  collaborationPreferences: { always: ['Challenge premises'], never: ['Flatter'], feedbackStyle: 'Direct' },
  alexCoachingNotes: [],
}

function loadStoredState(): { status?: string; answers?: Record<string, string> } {
  return JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY) ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VoiceProfileRitualPage', () => {
  it('fresh start: intro offers Begin and a first-run skip that records skipped state', () => {
    const onExit = vi.fn()
    render(<VoiceProfileRitualPage onExit={onExit} />)

    expect(screen.getByRole('heading', { name: 'The story of you.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(onExit).toHaveBeenCalled()
    expect(loadStoredState().status).toBe('skipped')
  })

  it('assessment walks one question at a time and autosaves answers', () => {
    render(<VoiceProfileRitualPage onExit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }))
    expect(screen.getByText('1 of 20')).toBeInTheDocument()
    expect(screen.getByText(/When a story idea hits you/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Answer in your own voice…'), { target: { value: 'A moral question, always.' } })
    expect(loadStoredState().status).toBe('draft_answers')
    expect(loadStoredState().answers?.q1).toBe('A moral question, always.')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('2 of 20')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('1 of 20')).toBeInTheDocument()
  })

  it('with saved progress, continue resumes at the first unanswered question', () => {
    const answers = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`q${i + 1}`, `answer ${i + 1}`]))
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, status: 'draft_answers', answers, createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T00:00:00Z',
    }))
    render(<VoiceProfileRitualPage onExit={vi.fn()} />)

    expect(screen.getByText(/You've answered 4 of 20/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('5 of 20')).toBeInTheDocument()
    // With progress, exiting is a save-and-close, not a skip.
    expect(screen.getByRole('button', { name: 'Save & close' })).toBeInTheDocument()
  })

  it('synthesizes after enough answers, reviews, and approves to complete', async () => {
    const answers = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i + 1}`, `answer ${i + 1}`]))
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, status: 'draft_answers', answers, createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T00:00:00Z',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: profileDoc }),
    }))

    render(<VoiceProfileRitualPage onExit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate profile from saved answers' }))

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/voice-profile/synthesize', expect.objectContaining({ method: 'POST' }))

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('heading', { name: 'The room knows your voice.' })).toBeInTheDocument()
    expect(loadStoredState().status).toBe('complete')
  })

  it('resumes directly into review when a draft profile exists', async () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, status: 'draft_profile', answers: { q1: 'a' }, profile: profileDoc,
      createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T00:00:00Z',
    }))
    render(<VoiceProfileRitualPage onExit={vi.fn()} />)

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('shows the synthesis error and allows retry', async () => {
    const answers = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i + 1}`, `answer ${i + 1}`]))
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1, status: 'draft_answers', answers, createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T00:00:00Z',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Synthesis failed hard.' }),
    }))

    render(<VoiceProfileRitualPage onExit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate profile from saved answers' }))

    expect(await screen.findByText('Synthesis failed hard.')).toBeInTheDocument()
    // Still on intro; the button remains for retry.
    expect(screen.getByRole('button', { name: 'Generate profile from saved answers' })).toBeInTheDocument()
  })
})
