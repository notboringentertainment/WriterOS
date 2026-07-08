import { describe, expect, it } from 'vitest'
import { decideSpeakers, isCaseyCharacterField } from '../../../server/room/wakeRules'
import type { RoomEventRow } from '../../../server/room/types'

const event = (kind: RoomEventRow['kind'], payload: Record<string, unknown> = {}): RoomEventRow => ({
  id: 'e1',
  project_id: 'p1',
  kind,
  payload,
  processed_at: null,
  created_at: new Date().toISOString(),
})

describe('isCaseyCharacterField', () => {
  it('matches the five psychology fields on character paths', () => {
    for (const field of ['want', 'need', 'flaw', 'secret', 'arc']) {
      expect(isCaseyCharacterField(`characters[abc-123].${field}`)).toBe(true)
    }
  })

  it('rejects other fields and other shapes', () => {
    expect(isCaseyCharacterField('characters[abc].name')).toBe(false)
    expect(isCaseyCharacterField('characters[abc].speechPatterns')).toBe(false)
    expect(isCaseyCharacterField('onePagePitch.logline')).toBe(false)
    expect(isCaseyCharacterField('want')).toBe(false)
  })
})

describe('decideSpeakers', () => {
  it('wakes Morgan on every writer message', () => {
    expect(decideSpeakers(event('writer_message', { content: 'hello room' }))).toEqual([
      { agentId: 'writingPartner', mode: 'turn' },
    ])
  })

  it('adds Casey when a known character is mentioned', () => {
    const speakers = decideSpeakers(
      event('writer_message', { content: 'What does Rosa actually want here?', characterNames: ['Rosa', 'Teo'] }),
    )
    expect(speakers).toEqual([
      { agentId: 'writingPartner', mode: 'turn' },
      { agentId: 'casey', mode: 'turn' },
    ])
  })

  it('wakes Casey on a story bible character psychology change', () => {
    const speakers = decideSpeakers(
      event('doc_field_changed', { surface: 'storyBible', fieldPath: 'characters[r1].want' }),
    )
    expect(speakers).toEqual([{ agentId: 'casey', mode: 'turn' }])
  })

  it('sleeps through non-character doc changes', () => {
    expect(decideSpeakers(event('doc_field_changed', { surface: 'storyBible', fieldPath: 'cover.title' }))).toEqual([])
    expect(decideSpeakers(event('doc_field_changed', { surface: 'outline', fieldPath: 'characters[r1].want' }))).toEqual([])
  })

  it('routes idle_tick to a Casey digest and ignores session_opened (Phase 1)', () => {
    expect(decideSpeakers(event('idle_tick'))).toEqual([{ agentId: 'casey', mode: 'digest' }])
    expect(decideSpeakers(event('session_opened'))).toEqual([])
  })
})
