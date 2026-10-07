// server/morganHost/proposals.ts
// Checks a page proposal before it reaches the page. Returns a plain problem, or null when it is usable.
import { z } from 'zod'
import {
  OutlineDocumentContentSchema, StoryBibleDocumentContentSchema, SynopsisDocumentContentSchema, TreatmentDocumentContentSchema,
} from '../../shared/documents'
import type { PageProposal } from '../../shared/morganLive'

const STRUCTURED = {
  synopsis: SynopsisDocumentContentSchema,
  outline: OutlineDocumentContentSchema,
  treatment: TreatmentDocumentContentSchema,
  storyBible: StoryBibleDocumentContentSchema,
} as const
const ScriptBlock = z.object({
  type: z.enum(['scene-heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition']),
  text: z.string().max(10_000),
})
const ScriptTarget = z.union([
  z.object({ kind: z.enum(['replace-scene', 'insert-after-scene']), sceneHeading: z.string().min(1).max(500), expectedScene: z.array(ScriptBlock).min(1).max(2000) }),
  z.object({ kind: z.literal('append') }),
])

const first = (e: z.ZodError) => { const i = e.issues[0]; return `${i.path.join('.') || 'content'}: ${i.message}` }

export function validateProposal(p: PageProposal): string | null {
  if (typeof p?.summary !== 'string' || p.summary.trim() === '') return 'summary: say in one line what changes and why'
  if (p.surface === 'script') {
    const target = ScriptTarget.safeParse(p.target)
    if (!target.success) return `target.${first(target.error)}`
    const blocks = z.array(ScriptBlock).min(1).max(2000).safeParse(p.blocks)
    return blocks.success ? null : `blocks.${first(blocks.error)}`
  }
  const schema = STRUCTURED[p.surface as keyof typeof STRUCTURED]
  if (!schema) return `surface: ${String((p as { surface: unknown }).surface)} cannot be changed this way`
  if (!Number.isInteger(p.baseRevision) || p.baseRevision < 0) return 'baseRevision: send the revision you read'
  const content = schema.safeParse(p.content)
  return content.success ? null : `content.${first(content.error)}`
}

