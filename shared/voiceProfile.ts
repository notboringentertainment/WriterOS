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
