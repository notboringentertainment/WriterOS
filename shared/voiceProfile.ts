import type { WorldContextVoiceProfileSlice } from './personaCapability'

export const VOICE_PROFILE_STORAGE_KEY = 'writeros_voice_profile_v1'

export interface VoiceProfileDocument {
  version: 1
  createdAt: string
  updatedAt: string
  displayName?: string
  archetype: string
  coreStatement: string
  creativeNorthStars: string[]
  storytellingDNA: {
    principles: string[]
    recurringThemes: string[]
    notes: string
  }
  influences: {
    writers: string[]
    directors: string[]
    filmsAndShows: string[]
    scenesAndLines: string[]
    notes: string
  }
  characterInstincts: {
    drawnTo: string[]
    rejects: string[]
    notes: string
  }
  dialogue: {
    rules: string[]
    instinctsByMode: string
    avoidances: string[]
  }
  visualLanguage: {
    instincts: string[]
    notes: string
  }
  process: {
    whenFlowing: string
    stuckPatterns: string[]
    supportNeeds: string[]
  }
  strengths: string[]
  growthEdges: string[]
  collaborationPreferences: {
    always: string[]
    never: string[]
    feedbackStyle: string
  }
  alexCoachingNotes: string[]
}

export interface VoiceProfileState {
  version: 1
  status: 'not_started' | 'skipped' | 'draft_answers' | 'draft_profile' | 'complete'
  skippedAt?: string
  answers: Record<string, string>
  deepDiveAnswers?: Record<string, string>
  refinementAnswers?: Record<string, string>
  profile?: VoiceProfileDocument
  createdAt?: string
  updatedAt: string
}

export function sliceVoiceProfileForWorldContext(
  profile: VoiceProfileDocument
): WorldContextVoiceProfileSlice {
  return {
    slice: 'world_context',
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    archetype: profile.archetype,
    coreStatement: profile.coreStatement,
    storytellingDNA: {
      recurringThemes: profile.storytellingDNA.recurringThemes,
    },
    influences: {
      notes: profile.influences.notes,
    },
    visualLanguage: {
      instincts: profile.visualLanguage.instincts,
      notes: profile.visualLanguage.notes,
    },
  }
}
