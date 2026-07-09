import { VOICE_PROFILE_STORAGE_KEY } from '@shared/voiceProfile'

// App-level tests seed a skipped Voice Profile so the first-run ritual gate
// (App.tsx) does not take over the shell when localStorage starts empty.
export function seedSkippedVoiceProfileState(): void {
  localStorage.setItem(
    VOICE_PROFILE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      status: 'skipped',
      answers: {},
      createdAt: '2026-07-09T00:00:00Z',
      updatedAt: '2026-07-09T00:00:00Z',
      skippedAt: '2026-07-09T00:00:00Z',
    }),
  )
}
