import { z } from 'zod'
import { ComposedDocumentSchema } from './compose/schemas'

export const WhatsStandingAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('referents'), recordIds: z.array(z.string().min(1)).min(1).max(50) }).strict(),
  z.object({ kind: z.literal('cant-say') }).strict(),
  z.object({ kind: z.literal('decline') }).strict(),
])
export const WhatsStandingAnswerRequestSchema = z.object({
  annotationId: z.string().min(1).max(200),
  questionVersion: z.string().regex(/^[0-9a-f]{64}$/),
  answer: WhatsStandingAnswerSchema,
}).strict()
export const EnrichedQuestionSchema = z.object({
  annotationId: z.string(),
  status: z.enum(['new', 'proposed']),
  questionText: z.string(),
  recordId: z.string(),
  candidates: z.array(z.object({ id: z.string(), headline: z.string() })),
  questionVersion: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()
export const WhatsStandingPayloadSchema = z.object({
  composed: ComposedDocumentSchema,
  questions: z.array(EnrichedQuestionSchema),
}).strict()
export type EnrichedQuestion = z.infer<typeof EnrichedQuestionSchema>
export type WhatsStandingPayload = z.infer<typeof WhatsStandingPayloadSchema>
