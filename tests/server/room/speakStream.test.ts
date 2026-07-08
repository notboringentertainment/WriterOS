import { describe, expect, it } from 'vitest'
import { createSpeakStreamTracker, extractSpeakContentPrefix } from '../../../server/room/speakStream'

describe('extractSpeakContentPrefix', () => {
  it('returns null before the content key opens', () => {
    expect(extractSpeakContentPrefix('')).toBeNull()
    expect(extractSpeakContentPrefix('{"conte')).toBeNull()
    expect(extractSpeakContentPrefix('{"content"')).toBeNull()
    expect(extractSpeakContentPrefix('{"content": ')).toBeNull()
  })

  it('decodes a growing plain prefix', () => {
    expect(extractSpeakContentPrefix('{"content": "He')).toBe('He')
    expect(extractSpeakContentPrefix('{"content": "Hello, wri')).toBe('Hello, wri')
  })

  it('stops at the closing quote and ignores later keys', () => {
    expect(extractSpeakContentPrefix('{"content": "Done.", "replyTo": "m1"}')).toBe('Done.')
  })

  it('decodes escapes and drops a trailing partial escape', () => {
    expect(extractSpeakContentPrefix('{"content": "line1\\nline2')).toBe('line1\nline2')
    expect(extractSpeakContentPrefix('{"content": "quote \\"x\\"')).toBe('quote "x"')
    // trailing lone backslash — incomplete escape must not leak
    expect(extractSpeakContentPrefix('{"content": "abc\\')).toBe('abc')
    // incomplete \u sequence
    expect(extractSpeakContentPrefix('{"content": "abc\\u00')).toBe('abc')
    expect(extractSpeakContentPrefix('{"content": "abc\\u00e9d')).toBe('abcéd')
  })
})

describe('createSpeakStreamTracker', () => {
  const start = (index: number, name: string) => ({
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', name },
  })
  const delta = (index: number, partial: string) => ({
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: partial },
  })

  it('emits growing content only for the speak block', () => {
    const emitted: string[] = []
    const track = createSpeakStreamTracker(content => emitted.push(content))

    track(start(0, 'remember')) // not speak — ignored
    track(delta(0, '{"label": "lane_notes"'))
    track(start(1, 'speak'))
    track(delta(1, '{"content": "On '))
    track(delta(1, 'the want change'))
    track(delta(1, '..."}'))

    expect(emitted).toEqual(['On ', 'On the want change', 'On the want change...'])
  })

  it('does not re-emit when the prefix has not grown', () => {
    const emitted: string[] = []
    const track = createSpeakStreamTracker(content => emitted.push(content))
    track(start(0, 'speak'))
    track(delta(0, '{"content": "Hi'))
    track(delta(0, '')) // empty fragment
    expect(emitted).toEqual(['Hi'])
  })

  it('handles text events without crashing', () => {
    const track = createSpeakStreamTracker(() => {})
    expect(() => {
      track({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })
      track({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta' } })
      track({ type: 'message_delta' })
    }).not.toThrow()
  })
})
