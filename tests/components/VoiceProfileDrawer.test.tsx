import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { VoiceProfileDrawer } from '../../client/src/components/shell/VoiceProfileDrawer'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument, type VoiceProfileState } from '@shared/voiceProfile'

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    displayName: 'Ben Roberts',
    archetype: 'The Moral Archaeologist',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure', 'genre momentum'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Taylor Sheridan'],
      directors: ['Michael Mann'],
      filmsAndShows: ['Arrival'],
      scenesAndLines: ['quiet impossible choice'],
      notes: 'Measured, humane, precise.',
    },
    characterInstincts: {
      drawnTo: ['competent people with private grief'],
      rejects: ['empty cynicism'],
      notes: 'Characters should reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional, sharper when defensive',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames', 'lonely scale'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline enough to know the pressure, then draft into discovery',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise', 'tone'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

function saveState(state: VoiceProfileState) {
  localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(state))
}

describe('VoiceProfileDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when closed', () => {
    render(<VoiceProfileDrawer open={false} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Voice Profile')).not.toBeInTheDocument()
  })

  it('shows an empty state when no profile exists', () => {
    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    expect(screen.getByText('No Voice Profile yet')).toBeInTheDocument()
    expect(screen.getByText('No profile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start assessment' })).toBeInTheDocument()
  })

  it('loads and displays a completed profile from localStorage', () => {
    const profile = makeProfile()
    saveState({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Ben Roberts')).toBeInTheDocument()
    expect(screen.getByText('The Moral Archaeologist')).toBeInTheDocument()
    expect(screen.getByText('subtext before explanation')).toBeInTheDocument()
  })

  it('closes from the close button and backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<VoiceProfileDrawer open={true} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Voice Profile' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = container.querySelector('[aria-hidden="true"]')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('clears the profile after confirmation', () => {
    const profile = makeProfile()
    saveState({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear profile' }))
    expect(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }))

    expect(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)).toBeNull()
    expect(screen.getByText('No Voice Profile yet')).toBeInTheDocument()
  })

  it('edits and saves profile fields back to localStorage', () => {
    const profile = makeProfile()
    saveState({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Archetype'), {
      target: { value: 'The Cinematic Moral Archaeologist' },
    })
    fireEvent.change(screen.getByLabelText('Creative north stars, one per line'), {
      target: { value: 'moral pressure\ncharged silence' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('The Cinematic Moral Archaeologist')).toBeInTheDocument()
    expect(screen.getByText('charged silence')).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!) as VoiceProfileState
    expect(saved.status).toBe('complete')
    expect(saved.profile?.archetype).toBe('The Cinematic Moral Archaeologist')
    expect(saved.profile?.creativeNorthStars).toEqual(['moral pressure', 'charged silence'])
  })

  it('requires archetype and core statement in edit mode', () => {
    const profile = makeProfile()
    saveState({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Archetype and core statement are required.')).toBeInTheDocument()
    expect(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)).toContain('The Moral Archaeologist')
  })

  it('starts the assessment and saves draft answers', () => {
    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))
    fireEvent.change(screen.getByLabelText(/When a story idea hits you/i), {
      target: { value: 'A character in a moment of moral failure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save answers' }))

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!) as VoiceProfileState
    expect(saved.status).toBe('draft_answers')
    expect(saved.answers.q1).toBe('A character in a moment of moral failure.')
    expect(saved.profile).toBeUndefined()
  })

  it('loads draft answers into assessment mode', () => {
    saveState({
      version: 1,
      status: 'draft_answers',
      answers: {
        q1: 'A moral question first.',
      },
      updatedAt: '2026-05-12T00:00:00.000Z',
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByLabelText(/When a story idea hits you/i)).toHaveValue('A moral question first.')
  })

  it('can return from draft assessment to the progress empty state', () => {
    saveState({
      version: 1,
      status: 'draft_answers',
      answers: {
        q1: 'A moral question first.',
      },
      updatedAt: '2026-05-12T00:00:00.000Z',
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('Assessment in progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue assessment' })).toBeInTheDocument()
    expect(screen.getByText('1/20 answered')).toBeInTheDocument()
  })
})

// ── Generate profile + review mode ──────────────────────────────────────────

function fillAnswers(count: number): void {
  for (let i = 1; i <= count; i++) {
    const textareas = document.querySelectorAll('textarea')
    if (i - 1 < textareas.length) {
      fireEvent.change(textareas[i - 1], { target: { value: `Answer ${i}` } })
    }
  }
}

describe('VoiceProfileDrawer — synthesis and review', () => {
  const mockProfile: VoiceProfileDocument = makeProfile()

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides Generate profile button when fewer than 10 answers', () => {
    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))
    // answer 9 questions
    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 9; i++) {
      fireEvent.change(textareas[i], { target: { value: `Answer ${i + 1}` } })
    }
    expect(screen.queryByRole('button', { name: /generate profile/i })).not.toBeInTheDocument()
  })

  it('shows Generate profile button when 10 or more answers', () => {
    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))
    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 10; i++) {
      fireEvent.change(textareas[i], { target: { value: `Answer ${i + 1}` } })
    }
    expect(screen.getByRole('button', { name: /generate profile/i })).toBeInTheDocument()
  })

  it('calls fetch on Generate profile and enters review mode on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: mockProfile }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))

    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 10; i++) {
      fireEvent.change(textareas[i], { target: { value: `Answer ${i + 1}` } })
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate profile/i }))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/voice-profile/synthesize',
      expect.objectContaining({ method: 'POST' })
    )
    // review mode: Approve button visible
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
    // profile content rendered
    expect(screen.getByText('The Moral Archaeologist')).toBeInTheDocument()
    // status badge shows Draft
    expect(screen.getByText('Draft')).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!) as VoiceProfileState
    expect(saved.status).toBe('draft_profile')
    expect(saved.profile?.archetype).toBe(mockProfile.archetype)
  })

  it('stays in assessment mode and shows error when synthesis fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'synthesis_failed', message: 'Model unavailable.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))

    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 10; i++) {
      fireEvent.change(textareas[i], { target: { value: `Answer ${i + 1}` } })
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate profile/i }))
    })

    expect(screen.getByText('Model unavailable.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    // Save answers still visible — still in assessment mode
    expect(screen.getByRole('button', { name: 'Save answers' })).toBeInTheDocument()
  })

  it('shows error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))

    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 10; i++) {
      fireEvent.change(textareas[i], { target: { value: `Answer ${i + 1}` } })
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate profile/i }))
    })

    expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument()
  })

  it('Approve sets status to complete and enters view mode', async () => {
    saveState({
      version: 1,
      status: 'draft_profile',
      answers: { q1: 'test' },
      profile: mockProfile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!) as VoiceProfileState
    expect(saved.status).toBe('complete')
  })

  it('Edit in review mode enters edit mode and Cancel returns to review', () => {
    saveState({
      version: 1,
      status: 'draft_profile',
      answers: { q1: 'test' },
      profile: mockProfile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Archetype')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('Regenerate re-calls fetch with cleaned answers', async () => {
    saveState({
      version: 1,
      status: 'draft_profile',
      answers: { q1: 'test' },
      profile: mockProfile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: mockProfile }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/voice-profile/synthesize',
      expect.objectContaining({ method: 'POST' })
    )
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('saves cleanAssessmentAnswers (trims whitespace, drops blanks) on generate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: mockProfile }),
    }))

    render(<VoiceProfileDrawer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }))

    const textareas = document.querySelectorAll('textarea')
    for (let i = 0; i < 10; i++) {
      fireEvent.change(textareas[i], { target: { value: i === 0 ? '  trimmed  ' : `Answer ${i + 1}` } })
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate profile/i }))
    })

    const saved = JSON.parse(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)!) as VoiceProfileState
    expect(saved.answers.q1).toBe('trimmed')
  })
})
