import { beforeEach, expect, it, vi } from 'vitest'
import { connectVoiceProfileLibrary, loadCompletedVoiceProfile, saveVoiceProfileState, clearVoiceProfileState } from '../../client/src/lib/voiceProfile'
import { makeProfile } from '../helpers/phase1VoiceProfile'

beforeEach(() => localStorage.clear())
const json = (body: unknown) => new Response(JSON.stringify(body))

it('loads a library profile into the existing synchronous callers and browser cache', async () => {
  const profile = makeProfile()
  localStorage.setItem('writeros_voice_profile_v1', JSON.stringify({
    version: 1, status: 'complete', answers: { q1: 'Keep my answers' }, profile, updatedAt: profile.updatedAt,
  }))
  await connectVoiceProfileLibrary(async () => json({ profile }))
  expect(loadCompletedVoiceProfile()).toEqual(profile)
  expect(JSON.parse(localStorage.getItem('writeros_voice_profile_v1')!).answers.q1).toBe('Keep my answers')
})

it('uploads a completed browser fallback and keeps it when the server is unavailable', async () => {
  const profile = makeProfile()
  localStorage.setItem('writeros_voice_profile_v1', JSON.stringify({
    version: 1, status: 'complete', answers: {}, profile, updatedAt: profile.updatedAt,
  }))
  const fetcher = vi.fn(async (_url, init) => json(init?.method === 'PUT' ? { ok: true } : { profile: null }))
  await connectVoiceProfileLibrary(fetcher)
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ profile })
  await connectVoiceProfileLibrary(async () => { throw new Error('Offline') })
  expect(loadCompletedVoiceProfile()).toEqual(profile)
})

it('saves edits and clearing in order through the library connection', async () => {
  const writes: unknown[] = []
  await connectVoiceProfileLibrary(async (_url, init) => {
    if (init?.method === 'PUT') writes.push(JSON.parse(init.body as string).profile)
    return json({ profile: null })
  })
  const profile = makeProfile()
  saveVoiceProfileState({ version: 1, status: 'complete', answers: {}, profile, updatedAt: profile.updatedAt })
  clearVoiceProfileState()
  await vi.waitFor(() => expect(writes).toEqual([profile, null]))
  expect(loadCompletedVoiceProfile()).toBeUndefined()
})

it('keeps unfinished browser answers when an older completed profile exists in the library', async () => {
  localStorage.setItem('writeros_voice_profile_v1', JSON.stringify({
    version: 1, status: 'draft_answers', answers: { q1: 'Still working' }, updatedAt: '2026-10-15',
  }))
  await connectVoiceProfileLibrary(async () => json({ profile: makeProfile() }))
  expect(JSON.parse(localStorage.getItem('writeros_voice_profile_v1')!).answers).toEqual({ q1: 'Still working' })
})

it('does not restore a cleared profile on reconnect, but uploads a profile saved after the clear', async () => {
  const profile = makeProfile()
  const clearedAt = '2026-10-16T12:00:00.000Z'
  const fetcher = vi.fn(async (_url, init) => json(init?.method === 'PUT' ? { ok: true } : { profile: null, clearedAt }))
  const cache = () => localStorage.setItem('writeros_voice_profile_v1', JSON.stringify({
    version: 1, status: 'complete', answers: {}, profile, updatedAt: profile.updatedAt,
  }))
  cache()
  await connectVoiceProfileLibrary(fetcher)
  expect(loadCompletedVoiceProfile()).toBeUndefined()
  expect(localStorage.getItem('writeros_voice_profile_v1')).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)

  profile.updatedAt = '2026-10-16T12:00:01.000Z'
  cache()
  await connectVoiceProfileLibrary(fetcher)
  expect(loadCompletedVoiceProfile()).toEqual(profile)
  expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({ profile })
})
