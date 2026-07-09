import { seedSkippedVoiceProfileState } from '../helpers/voiceProfileTestState'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument } from '@shared/voiceProfile'

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Private Writer List'],
      directors: ['Private Director List'],
      filmsAndShows: ['Private Film List'],
      scenesAndLines: ['Private Scene List'],
      notes: 'Measured, humane, precise.',
    },
    characterInstincts: {
      drawnTo: ['competent people with private grief'],
      rejects: ['empty cynicism'],
      notes: 'Characters reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline then draft',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

function openRailAndSend(text: string) {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))
  fireEvent.click(screen.getByTitle('Morgan'))
  fireEvent.change(screen.getByPlaceholderText('Message Morgan…'), {
    target: { value: text },
  })
  fireEvent.keyDown(screen.getByPlaceholderText('Message Morgan…'), { key: 'Enter' })
}

describe('App Zoe persona capability routing', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSkippedVoiceProfileState()
    vi.restoreAllMocks()
  })

  it('routes @Zoe research intent to persona capability and stores only final Zoe response plus receipt', async () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        finalMessage: 'Use the gate as a threshold into layered jurisdiction. [Archive]',
        receipt: {
          schemaVersion: 1,
          taskKind: 'research_world_context',
          personaId: 'zoe',
          startedAt: '2026-05-14T20:00:00.000Z',
          completedAt: '2026-05-14T20:00:01.000Z',
          durationMs: 1000,
          status: 'ok',
          contextChips: [],
          voiceProfile: { included: true, slice: 'world_context' },
          missingSurfaces: ['logline', 'synopsis', 'storyBible', 'characters'],
          sources: [{ label: 'Archive', citedInFinal: true }],
        },
        rawTaskBody: 'RAW TASK BODY SHOULD NOT BE RENDERED',
      }),
    }))

    openRailAndSend('@Zoe research the construction period of Damascus Gate')

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/persona-capability/run',
        expect.objectContaining({ method: 'POST' })
      )
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.personaId).toBe('zoe')
    expect(body.taskKind).toBe('research_world_context')
    expect(body.voiceProfile.slice).toBe('world_context')
    expect(JSON.stringify(body.voiceProfile)).not.toContain('subtext before explanation')
    expect(JSON.stringify(body.voiceProfile)).not.toContain('Private Writer List')

    expect(await screen.findByText('Morgan (@Zoe)')).toBeInTheDocument()
    expect(screen.getByText('Use the gate as a threshold into layered jurisdiction. [Archive]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /world-context research receipt/i })).toBeInTheDocument()
    expect(screen.queryByText('RAW TASK BODY SHOULD NOT BE RENDERED')).not.toBeInTheDocument()
  })

  it('keeps non-research @Zoe requests on the normal wp-chat path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Zoe direct answer.', suggestions: [] }),
    }))

    openRailAndSend('@Zoe give me color for this gate scene')

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/wp-chat',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/wp-chat')
    expect(await screen.findByText('Zoe direct answer.')).toBeInTheDocument()
  })
})
