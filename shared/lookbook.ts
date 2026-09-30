import { z } from 'zod'

export const LookbookQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string(),
  askedBy: z.literal('zoe'),
  createdAt: z.string().min(1),
  dismissedAt: z.string().optional(),
}).strict()
export const LookbookBeatSchema = z.object({ titleAtAsk: z.string(), questions: z.array(LookbookQuestionSchema) }).strict()
export const LookbookDocumentSchema = z.object({ version: z.literal(1), beats: z.record(z.string(), LookbookBeatSchema) }).strict()
export type LookbookDocument = z.infer<typeof LookbookDocumentSchema>
export type LookbookQuestion = z.infer<typeof LookbookQuestionSchema>

export function emptyLookbook(): LookbookDocument { return { version: 1, beats: {} } }
export function hasLookbookContent(doc: LookbookDocument | undefined): boolean {
  return !!doc && Object.values(doc.beats).some(beat => beat.questions.length > 0)
}
export function orphanedBeatKeys(doc: LookbookDocument, liveKeys: ReadonlySet<string>): string[] {
  return Object.keys(doc.beats).filter(key => !liveKeys.has(key)).sort()
}
