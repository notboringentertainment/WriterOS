import { describe, expect, it, beforeEach } from 'vitest'
import { VOICE_PROFILE_STORAGE_KEY, type VoiceProfileDocument } from '@shared/voiceProfile'
import {
  completedVoiceProfileFromState,
  loadCompletedVoiceProfile,
  parseCompletedVoiceProfile,
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
