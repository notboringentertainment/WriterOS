import { describe, expect, it } from 'vitest'
import { PROMOTED_LOOKS_RULE, buildLookbookSystemPrompt, buildLookbookUserMessage } from '../../server/lookbook/buildLookbookPrompt'

describe('Lookbook prompt and promoted looks', () => {
  const input = { movement: 'Act One', title: 'The dinner', body: 'They eat.', existingPrompts: [] }

  it('is unchanged when no look is promoted', () => {
    expect(buildLookbookSystemPrompt('')).toBe(buildLookbookSystemPrompt('', false))
    expect(buildLookbookSystemPrompt('')).not.toContain(PROMOTED_LOOKS_RULE)
    expect(buildLookbookUserMessage({ ...input, promotedLooks: [] })).toBe(buildLookbookUserMessage(input))
  })

  it('tells Zoe not to ask about what a promoted look covers, and lists them', () => {
    expect(buildLookbookSystemPrompt('', true)).toContain('Do not ask about anything a promoted look already covers')
    const message = JSON.parse(buildLookbookUserMessage({ ...input, promotedLooks: [{ kind: 'character', name: 'Vector Engineer', summary: 'A wiry engineer.' }] }))
    expect(message.promotedLooks).toEqual([{ kind: 'character', name: 'Vector Engineer', summary: 'A wiry engineer.' }])
  })
})
