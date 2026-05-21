import { describe, expect, it, beforeEach } from 'vitest'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument, type VoiceProfileState } from '@shared/voiceProfile'
import {
  clearVoiceProfileState,
  completedVoiceProfileFromState,
  loadCompletedVoiceProfile,
  loadCompletedVoiceProfileSliced,
  loadVoiceProfileState,
  parseCompletedVoiceProfile,
  saveVoiceProfileState,
} from '../../client/src/lib/voiceProfile'

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
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

describe('Voice Profile loading', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns undefined when no profile has been saved', () => {
    expect(loadCompletedVoiceProfile()).toBeUndefined()
  })

  it('loads only completed writer-scoped profiles from the separate storage key', () => {
    const profile = makeProfile()
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }))

    expect(loadCompletedVoiceProfile()).toEqual(profile)
  })

  it('does not return draft or skipped profile states', () => {
    const profile = makeProfile()

    expect(completedVoiceProfileFromState({
      version: 1,
      status: 'draft_profile',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    })).toBeUndefined()

    expect(completedVoiceProfileFromState({
      version: 1,
      status: 'skipped',
      answers: {},
      updatedAt: profile.updatedAt,
    })).toBeUndefined()
  })

  it('does not return structurally incomplete completed profiles', () => {
    expect(completedVoiceProfileFromState({
      version: 1,
      status: 'complete',
      answers: {},
      profile: {
        version: 1,
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
        archetype: 'Humanist genre pressure',
        coreStatement: 'Almost a profile, but missing sections.',
      },
      updatedAt: '2026-05-11T00:00:00.000Z',
    })).toBeUndefined()
  })

  it('survives malformed storage values', () => {
    expect(parseCompletedVoiceProfile('{not json')).toBeUndefined()
  })
})

describe('Voice Profile state storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const minimalState: VoiceProfileState = {
    version: 1,
    status: 'draft_answers',
    answers: { q1: 'test answer' },
    updatedAt: '2026-05-12T00:00:00.000Z',
  }

  it('returns undefined when no profile state has been saved', () => {
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('returns full state regardless of completion status', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(minimalState))
    expect(loadVoiceProfileState()).toEqual(minimalState)
  })

  it('returns completed state with a valid completed profile', () => {
    const profile = makeProfile()
    const state: VoiceProfileState = {
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: profile.updatedAt,
    }
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(state))
    expect(loadVoiceProfileState()).toEqual(state)
  })

  it('rejects malformed JSON', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, '{not json')
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('rejects objects without the required state shape', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('rejects unknown status values', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      ...minimalState,
      status: 'uploaded',
    }))
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('rejects complete states without a valid profile document', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify({
      ...minimalState,
      status: 'complete',
      profile: { version: 1, archetype: 'Incomplete', coreStatement: 'Missing sections' },
    }))
    expect(loadVoiceProfileState()).toBeUndefined()
  })

  it('writes state to the separate Voice Profile storage key with a fresh updatedAt', () => {
    const before = new Date().toISOString()
    saveVoiceProfileState(minimalState)
    const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.status).toBe('draft_answers')
    expect(parsed.answers.q1).toBe('test answer')
    expect(parsed.updatedAt >= before).toBe(true)
  })

  it('clears profile state safely', () => {
    localStorage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(minimalState))
    clearVoiceProfileState()
    expect(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)).toBeNull()
    expect(() => clearVoiceProfileState()).not.toThrow()
  })

  it('round-trips draft_profile state with profile and answers intact', () => {
    const profile = makeProfile()
    const state: VoiceProfileState = {
      version: 1,
      status: 'draft_profile',
      answers: { q1: 'A character in a moment of failure.', q3: 'Started with a moral question.' },
      profile,
      createdAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T00:00:00.000Z',
    }
    saveVoiceProfileState(state)
    const loaded = loadVoiceProfileState()
    expect(loaded?.status).toBe('draft_profile')
    expect(loaded?.profile?.archetype).toBe(profile.archetype)
    expect(loaded?.answers.q1).toBe('A character in a moment of failure.')
  })

  it('draft_profile is not surfaced by loadCompletedVoiceProfile', () => {
    const profile = makeProfile()
    saveVoiceProfileState({
      version: 1,
      status: 'draft_profile',
      answers: {},
      profile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })
    expect(loadCompletedVoiceProfile()).toBeUndefined()
  })

  it('loads only the world-context slice for persona capability calls', () => {
    const profile = makeProfile()
    saveVoiceProfileState({
      version: 1,
      status: 'complete',
      answers: {},
      profile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })

    const slice = loadCompletedVoiceProfileSliced('world_context')
    expect(slice?.slice).toBe('world_context')
    expect(slice?.archetype).toBe(profile.archetype)
    expect(slice?.visualLanguage.instincts).toEqual(profile.visualLanguage.instincts)

    const serialized = JSON.stringify(slice)
    expect(serialized).not.toContain('dialogue')
    expect(serialized).not.toContain('characterInstincts')
    expect(serialized).not.toContain('alexCoachingNotes')
  })

  it('does not load a capability slice from a draft profile', () => {
    const profile = makeProfile()
    saveVoiceProfileState({
      version: 1,
      status: 'draft_profile',
      answers: {},
      profile,
      updatedAt: '2026-05-13T00:00:00.000Z',
    })

    expect(loadCompletedVoiceProfileSliced('world_context')).toBeUndefined()
  })
})
