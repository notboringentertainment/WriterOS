import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../client/src/App'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument } from '@shared/voiceProfile'

// Integration proof: when a COMPLETED Voice Profile exists, the normal /api/wp-chat
// request must carry the FULL profile so persona chat can be conditioned. Draft/
// incomplete profiles must be omitted. The Zoe research capability path must keep
// sending only the narrow world_context slice (no regression / no full-profile leak).

const DEEP_FIELD = 'subtext before explanation' // present in full doc, absent from the world_context slice

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
      rules: [DEEP_FIELD],
      instinctsByMode: 'spare when emotional',
      avoidances: ['generic banter'],
    },
    visualLanguage: { instincts: ['clean frames'], notes: 'Beauty with restraint.' },
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

function seedCompleted(profile: VoiceProfileDocument) {
  localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
    version: 1, status: 'complete', answers: {}, profile, updatedAt: profile.updatedAt,
  }))
}

function seedDraft() {
  localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
    version: 1, status: 'draft_answers', answers: { q1: 'a' }, updatedAt: '2026-05-11T00:00:00.000Z',
  }))
}

function sendToWritingPartner(text: string) {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Current' }))
  fireEvent.click(screen.getByTitle('Morgan'))
  const input = screen.getByPlaceholderText('Message Morgan…')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

function bodyFor(url: string) {
  const call = vi.mocked(fetch).mock.calls.find(c => String(c[0]).includes(url))
  if (!call) throw new Error(`no ${url} request was sent`)
  return JSON.parse(String((call[1] as RequestInit)?.body))
}

describe('App voice profile — wp-chat conditioning', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('/api/persona-capability/run')) {
        return { ok: true, json: async () => ({ status: 'ok', finalMessage: 'ok', receipt: { schemaVersion: 1, taskKind: 'research_world_context', personaId: 'zoe', startedAt: '', completedAt: '', durationMs: 0, status: 'ok', contextChips: [], voiceProfile: { included: true, slice: 'world_context' }, missingSurfaces: [], sources: [] } }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({ message: 'ok', suggestions: [] }) } as Response
    }))
  })

  it('sends the FULL completed profile on a normal wp-chat request', async () => {
    seedCompleted(makeProfile())
    sendToWritingPartner('Help me sharpen my logline.')

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(c => String(c[0]).includes('/api/wp-chat'))).toBe(true))

    const body = bodyFor('/api/wp-chat')
    expect(body.voiceProfile).toBeTruthy()
    expect(body.voiceProfile.archetype).toBe('Humanist genre pressure')
    // Full doc, not the narrow world_context slice:
    expect(body.voiceProfile.dialogue.rules).toContain(DEEP_FIELD)
  })

  it('omits voiceProfile when the profile is only a draft', async () => {
    seedDraft()
    sendToWritingPartner('Help me sharpen my logline.')

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(c => String(c[0]).includes('/api/wp-chat'))).toBe(true))

    const body = bodyFor('/api/wp-chat')
    expect(body.voiceProfile).toBeUndefined()
  })

  it('Zoe research capability still sends ONLY the world_context slice (no full-profile leak)', async () => {
    seedCompleted(makeProfile())
    sendToWritingPartner('@Zoe research the construction period of Damascus Gate')

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(c => String(c[0]).includes('/api/persona-capability/run'))).toBe(true))

    const body = bodyFor('/api/persona-capability/run')
    expect(body.voiceProfile.slice).toBe('world_context')
    expect(JSON.stringify(body.voiceProfile)).not.toContain(DEEP_FIELD)
  })
})
