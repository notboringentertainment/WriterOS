import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument } from '@shared/voiceProfile'

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    displayName: 'Ben',
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure', 'genre momentum'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Ursula K. Le Guin'],
      directors: ['Denis Villeneuve'],
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

async function sendSwarmMessage() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))

  fireEvent.click(screen.getByTitle('Morgan'))
  fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), {
    target: { value: '/swarm review this against my voice' },
  })
  fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      '/api/openswarm/writing-partner',
      expect.objectContaining({ method: 'POST' })
    )
  })
}

describe('App OpenSwarm handoff', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'OpenSwarm saw the handoff.' }),
    }))
  })

  it('includes completed Voice Profile when sending a /swarm message', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    await sendSwarmMessage()

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.message).toBe('review this against my voice')
    expect(body.voiceProfile?.archetype).toBe(profile.archetype)
    expect(body.voiceProfile?.dialogue.rules).toEqual(['subtext before explanation'])
  })

  it('omits draft Voice Profile when sending a /swarm message', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'draft_profile',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    await sendSwarmMessage()

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.message).toBe('review this against my voice')
    expect(body.voiceProfile).toBeUndefined()
  })
})
