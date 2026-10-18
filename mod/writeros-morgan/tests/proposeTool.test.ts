// mod/writeros-morgan/tests/proposeTool.test.ts
import { test, expect } from 'claude-code/testing'
import { outcomeText, PROPOSE_INPUT_SCHEMA } from '../hooks/proposeTool'

test('schema names prose pages and surviving structured targets', () => {
  expect(PROPOSE_INPUT_SCHEMA.properties.surface.enum).toEqual(['page', 'outline', 'storyBible', 'script'])
  expect(PROPOSE_INPUT_SCHEMA.properties.page.enum).toEqual(['synopsis', 'treatment', 'outline', 'bible'])
})

test('outcomes read plainly to Morgan', () => {
  expect(outcomeText({ outcome: 'kept' })).toBe('The writer kept the change. It is on the page now.')
  expect(outcomeText({ outcome: 'dismissed', note: 'too long' })).toBe('The writer dismissed the change: too long')
  expect(outcomeText({ outcome: 'stale' })).toMatch(/changed since you read it/)
  expect(outcomeText({ outcome: 'invalid', message: 'blocks[2].type: unknown element' })).toMatch(/could not use it: blocks\[2\]/)
  expect(outcomeText({ outcome: 'session-ended' })).toMatch(/session ended/)
})
