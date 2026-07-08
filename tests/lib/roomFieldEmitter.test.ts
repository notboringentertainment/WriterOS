import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoomFieldEmitter, type FieldChange } from '../../client/src/lib/roomFieldEmitter'
import { createEmptyStoryBibleContent } from '@shared/documents'
import type { StoryBibleDocumentContent } from '@shared/documents'

const character = (id: string, overrides: Record<string, string> = {}) => ({
  id,
  name: 'Rosa',
  role: 'lead',
  want: '',
  need: '',
  flaw: '',
  secret: '',
  contradiction: '',
  arc: '',
  relationshipPressure: '',
  behavioralAnchors: '',
  speechPatterns: '',
  neverWriteThemAs: '',
  continuityFacts: '',
  ...overrides,
})

const content = (chars: ReturnType<typeof character>[]): StoryBibleDocumentContent => ({
  ...createEmptyStoryBibleContent(),
  characters: chars,
})

describe('createRoomFieldEmitter', () => {
  let emitted: FieldChange[]
  let emitter: ReturnType<typeof createRoomFieldEmitter>

  beforeEach(() => {
    vi.useFakeTimers()
    emitted = []
    emitter = createRoomFieldEmitter((change) => emitted.push(change))
  })

  afterEach(() => {
    emitter.reset()
    vi.useRealTimers()
  })

  it('emits immediately on the first change (leading edge — the acceptance clock)', () => {
    emitter.observe('p1', content([character('r1', { want: 'a' })]), content([character('r1', { want: 'ab' })]))
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      projectId: 'p1',
      characterId: 'r1',
      characterName: 'Rosa',
      field: 'want',
      oldValue: 'a',
      newValue: 'ab',
    })
  })

  it('suppresses keystrokes inside the 90s window, then fires one trailing refresh', () => {
    emitter.observe('p1', content([character('r1', { want: '' })]), content([character('r1', { want: 'w' })]))
    emitter.observe('p1', content([character('r1', { want: 'w' })]), content([character('r1', { want: 'wi' })]))
    emitter.observe('p1', content([character('r1', { want: 'wi' })]), content([character('r1', { want: 'win' })]))
    expect(emitted).toHaveLength(1) // only the leading emit

    vi.advanceTimersByTime(90_000)
    expect(emitted).toHaveLength(2) // one trailing refresh with the final value
    expect(emitted[1]).toMatchObject({ oldValue: 'w', newValue: 'win' })
  })

  it('does not fire a trailing refresh when the value settled back to what was emitted', () => {
    emitter.observe('p1', content([character('r1', { want: '' })]), content([character('r1', { want: 'win' })]))
    emitter.observe('p1', content([character('r1', { want: 'win' })]), content([character('r1', { want: 'winx' })]))
    emitter.observe('p1', content([character('r1', { want: 'winx' })]), content([character('r1', { want: 'win' })]))
    vi.advanceTimersByTime(90_000)
    expect(emitted).toHaveLength(1)
  })

  it('is idempotent for a repeated identical observe (StrictMode double-invoke)', () => {
    const prev = content([character('r1', { want: 'a' })])
    const next = content([character('r1', { want: 'b' })])
    emitter.observe('p1', prev, next)
    emitter.observe('p1', prev, next)
    vi.advanceTimersByTime(90_000)
    expect(emitted).toHaveLength(1)
  })

  it('debounces per field — different fields fire independently', () => {
    emitter.observe('p1', content([character('r1', { want: 'a' })]), content([character('r1', { want: 'b' })]))
    emitter.observe('p1', content([character('r1', { need: '' })]), content([character('r1', { need: 'forgive' })]))
    expect(emitted).toHaveLength(2)
    expect(emitted.map((e) => e.field)).toEqual(['want', 'need'])
  })

  it('ignores unwatched fields and brand-new characters', () => {
    emitter.observe('p1', content([character('r1', { speechPatterns: 'x' })]), content([character('r1', { speechPatterns: 'y' })]))
    emitter.observe('p1', content([]), content([character('r2', { want: 'new want' })]))
    expect(emitted).toHaveLength(0)
  })

  it('re-opens the window after 90s of quiet (next edit emits immediately again)', () => {
    emitter.observe('p1', content([character('r1', { want: 'a' })]), content([character('r1', { want: 'b' })]))
    vi.advanceTimersByTime(91_000)
    emitter.observe('p1', content([character('r1', { want: 'b' })]), content([character('r1', { want: 'c' })]))
    expect(emitted).toHaveLength(2)
    expect(emitted[1]).toMatchObject({ oldValue: 'b', newValue: 'c' })
  })
})
