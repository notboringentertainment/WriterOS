import {
  VOICE_PROFILE_STORAGE_KEY,
  sliceVoiceProfileForWorldContext,
  type VoiceProfileDocument,
  type VoiceProfileState,
} from '@shared/voiceProfile'
import type { WorldContextVoiceProfileSlice } from '@shared/personaCapability'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string'
}

function hasStringArray(value: Record<string, unknown>, key: string): boolean {
  return Array.isArray(value[key]) && (value[key] as unknown[]).every(item => typeof item === 'string')
}

function hasOptionalString(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === 'string'
}

function isAnswerMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

const VOICE_PROFILE_STATUSES = new Set<VoiceProfileState['status']>([
  'not_started',
  'skipped',
  'draft_answers',
  'draft_profile',
  'complete',
])

function isVoiceProfileDocument(value: unknown): value is VoiceProfileDocument {
  if (!isRecord(value)) return false
  const storytellingDNA = value.storytellingDNA
  const influences = value.influences
  const characterInstincts = value.characterInstincts
  const dialogue = value.dialogue
  const visualLanguage = value.visualLanguage
  const process = value.process
  const collaborationPreferences = value.collaborationPreferences

  return value.version === 1 &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.displayName === undefined || typeof value.displayName === 'string') &&
    typeof value.archetype === 'string' &&
    typeof value.coreStatement === 'string' &&
    hasStringArray(value, 'creativeNorthStars') &&
    isRecord(storytellingDNA) &&
    hasStringArray(storytellingDNA, 'principles') &&
    hasStringArray(storytellingDNA, 'recurringThemes') &&
    hasString(storytellingDNA, 'notes') &&
    isRecord(influences) &&
    hasStringArray(influences, 'writers') &&
    hasStringArray(influences, 'directors') &&
    hasStringArray(influences, 'filmsAndShows') &&
    hasStringArray(influences, 'scenesAndLines') &&
    hasString(influences, 'notes') &&
    isRecord(characterInstincts) &&
    hasStringArray(characterInstincts, 'drawnTo') &&
    hasStringArray(characterInstincts, 'rejects') &&
    hasString(characterInstincts, 'notes') &&
    isRecord(dialogue) &&
    hasStringArray(dialogue, 'rules') &&
    hasString(dialogue, 'instinctsByMode') &&
    hasStringArray(dialogue, 'avoidances') &&
    isRecord(visualLanguage) &&
    hasStringArray(visualLanguage, 'instincts') &&
    hasString(visualLanguage, 'notes') &&
    isRecord(process) &&
    hasString(process, 'whenFlowing') &&
    hasStringArray(process, 'stuckPatterns') &&
    hasStringArray(process, 'supportNeeds') &&
    hasStringArray(value, 'strengths') &&
    hasStringArray(value, 'growthEdges') &&
    isRecord(collaborationPreferences) &&
    hasStringArray(collaborationPreferences, 'always') &&
    hasStringArray(collaborationPreferences, 'never') &&
    hasString(collaborationPreferences, 'feedbackStyle') &&
    hasStringArray(value, 'alexCoachingNotes')
}

function isVoiceProfileState(value: unknown): value is VoiceProfileState {
  if (!isRecord(value)) return false
  const status = value.status
  if (value.version !== 1 || typeof status !== 'string' || !VOICE_PROFILE_STATUSES.has(status as VoiceProfileState['status'])) {
    return false
  }
  if (!isAnswerMap(value.answers) || typeof value.updatedAt !== 'string') return false
  if (!hasOptionalString(value, 'createdAt') || !hasOptionalString(value, 'skippedAt')) return false
  if (value.deepDiveAnswers !== undefined && !isAnswerMap(value.deepDiveAnswers)) return false
  if (value.refinementAnswers !== undefined && !isAnswerMap(value.refinementAnswers)) return false
  if (value.profile !== undefined && !isVoiceProfileDocument(value.profile)) return false
  if (status === 'complete' && !isVoiceProfileDocument(value.profile)) return false
  return true
}

export function completedVoiceProfileFromState(rawState: unknown): VoiceProfileDocument | undefined {
  if (!isRecord(rawState)) return undefined
  const state = rawState as Partial<VoiceProfileState>
  if (state.status !== 'complete') return undefined
  return isVoiceProfileDocument(state.profile) ? state.profile : undefined
}

export function parseCompletedVoiceProfile(rawValue: string | null): VoiceProfileDocument | undefined {
  if (!rawValue) return undefined
  try {
    return completedVoiceProfileFromState(JSON.parse(rawValue))
  } catch {
    return undefined
  }
}

export function loadCompletedVoiceProfile(): VoiceProfileDocument | undefined {
  if (typeof localStorage === 'undefined') return undefined
  return parseCompletedVoiceProfile(localStorage.getItem(VOICE_PROFILE_STORAGE_KEY))
}

export function loadCompletedVoiceProfileSliced(
  slice: 'world_context'
): WorldContextVoiceProfileSlice | undefined {
  const profile = loadCompletedVoiceProfile()
  if (!profile) return undefined
  return slice === 'world_context'
    ? sliceVoiceProfileForWorldContext(profile)
    : undefined
}

export function loadVoiceProfileState(): VoiceProfileState | undefined {
  if (typeof localStorage === 'undefined') return undefined
  const raw = localStorage.getItem(VOICE_PROFILE_STORAGE_KEY)
  if (!raw) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    return isVoiceProfileState(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function saveVoiceProfileState(state: VoiceProfileState): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    VOICE_PROFILE_STORAGE_KEY,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() })
  )
}

export function clearVoiceProfileState(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(VOICE_PROFILE_STORAGE_KEY)
}
