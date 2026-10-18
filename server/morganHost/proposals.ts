// server/morganHost/proposals.ts
// Checks a page proposal before it reaches the page. Returns a plain problem, or null when it is usable.
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import {
  OutlineDocumentContentSchema, StoryBibleDocumentContentSchema,
} from '../../shared/documents'
import type { PageProposal } from '../../shared/morganLive'

const STRUCTURED = {
  outline: OutlineDocumentContentSchema,
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

// The page as it is now, for checks that depend on it. Absent = unknown, and those checks are skipped.
export interface CurrentPages { outline?: unknown }

export const SYNCED_BEATS_PROBLEM =
  "content.units: this Outline's beats are copied from the Story-drive beat sheet, so the page cannot change them. " +
  'Edit the beat sheet instead (with a dated amendment note, after the writer says yes); WriterOS copies the beats in when the page reloads. ' +
  "You can still propose changes to the Outline's other parts."

// A synced beat sheet owns the Outline's beats: WriterOS restores them on every save, so a proposal that changes them could never be kept.
function changesSyncedBeats(proposed: unknown, current: unknown): boolean {
  const now = OutlineDocumentContentSchema.safeParse(current)
  if (!now.success || !now.data.beatSheetSource) return false
  const next = OutlineDocumentContentSchema.safeParse(proposed)
  return next.success && !isDeepStrictEqual(next.data.units, now.data.units)
}

export function validateProposal(p: PageProposal, current: CurrentPages = {}): string | null {
  if (['synopsis', 'treatment'].includes(String(p?.surface))) return 'This page is now written by Morgan'
  if (typeof p?.summary !== 'string' || p.summary.trim() === '') return 'summary: say in one line what changes and why'
  if (p.surface === 'page') {
    if (!['synopsis', 'treatment', 'outline', 'bible'].includes(p.page)) return 'page: choose synopsis, treatment, outline or bible'
    if (!Number.isInteger(p.baseRevision) || p.baseRevision < 0) return 'baseRevision: send the revision you read'
    return typeof p.markdown === 'string' ? null : 'markdown: send the whole page as prose'
  }
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
  if (!content.success) return `content.${first(content.error)}`
  if (p.surface === 'outline' && changesSyncedBeats(p.content, current.outline)) return SYNCED_BEATS_PROBLEM
  return null
}
