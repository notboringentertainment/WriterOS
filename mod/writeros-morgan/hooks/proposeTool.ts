// mod/writeros-morgan/hooks/proposeTool.ts — pure helpers, no `$`
import type { ProposalOutcome } from './protocol'

export const PROPOSE_TOOL_NAME = 'propose_page_change'
export const PROPOSE_DESCRIPTION = [
  'Show the writer a change to a WriterOS page; they keep or dismiss it on the page. Returns their decision.',
  'synopsis / outline / treatment / storyBible: read documents/<surface>.json in the WriterOS package first; send the whole new `content` (same shape) and the `revision` you read as `baseRevision`.',
  'script: read script/script.writeros.html first. Send `blocks` (each {type, text}; types: scene-heading, action, character, dialogue, parenthetical, transition) and a `target`: replace-scene or insert-after-scene with the exact `sceneHeading` and `expectedScene` (every paragraph of that scene as you read it, heading first, each {type, text} from its data-element-type and text), or append with `expectedEnding` (the last scene the same way).',
  'Always include a one-line `summary` of what changes and why.',
].join(' ')
export const PROPOSE_INPUT_SCHEMA = {
  type: 'object',
  required: ['surface', 'summary'],
  properties: {
    surface: { type: 'string', enum: ['synopsis', 'outline', 'treatment', 'storyBible', 'script'] },
    summary: { type: 'string', maxLength: 500 },
    baseRevision: { type: 'integer', minimum: 0 },
    content: { type: 'object' },
    target: { type: 'object' },
    expectedEnding: { type: 'array', maxItems: 2000, items: { type: 'object', required: ['type', 'text'] } },
    blocks: { type: 'array', maxItems: 2000, items: { type: 'object', required: ['type', 'text'] } },
  },
} as const

export function outcomeText(o: ProposalOutcome): string {
  switch (o.outcome) {
    case 'kept': return 'The writer kept the change. It is on the page now.'
    case 'dismissed': return `The writer dismissed the change${o.note ? `: ${o.note}` : '.'}`
    case 'stale': return 'The page changed since you read it, so the change was not applied. Read it again and redo the change.'
    case 'invalid': return `WriterOS could not use it: ${o.message ?? 'the change did not match the page format.'}`
    case 'session-ended': return 'The session ended before the writer decided.'
  }
}
