import { describe, expect, it } from 'vitest'
import { LookbookDocumentSchema, emptyLookbook, hasLookbookContent, orphanedBeatKeys } from '../../shared/lookbook'

describe('lookbook', () => {
  it('empty lookbook has no content', () => {
    expect(hasLookbookContent(emptyLookbook())).toBe(false)
    expect(hasLookbookContent(undefined)).toBe(false)
  })
  it('a beat with one question counts as content', () => {
    const doc = LookbookDocumentSchema.parse({ version: 1, beats: { 'beat.the-dinner': { titleAtAsk: 'The dinner.', questions: [
      { id: 'q1', prompt: 'What is on the table?', answer: '', askedBy: 'zoe', createdAt: '2026-01-01T00:00:00.000Z' } ] } } })
    expect(hasLookbookContent(doc)).toBe(true)
  })
  it('orphans are beats in the lookbook that are not live', () => {
    const doc = emptyLookbook()
    doc.beats['beat.gone'] = { titleAtAsk: 'Gone.', questions: [] }
    doc.beats['beat.here'] = { titleAtAsk: 'Here.', questions: [] }
    expect(orphanedBeatKeys(doc, new Set(['beat.here']))).toEqual(['beat.gone'])
  })
})
