import { z } from 'zod'
import { MemoryReceiptSchema } from './schema'

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

export const LookbookQuestionsRequestSchema = z.object({
  beatKey: z.string().min(1),
  clientRequestId: z.string().min(1),
}).strict()
export type LookbookQuestionsRequest = z.infer<typeof LookbookQuestionsRequestSchema>

export const LookbookQuestionsResponseSchema = z.object({
  questions: z.array(z.object({ prompt: z.string() })),
  nothingToSee: z.boolean(),
  memoryReceipt: MemoryReceiptSchema.optional(),
})
export type LookbookQuestionsResponse = z.infer<typeof LookbookQuestionsResponseSchema>
