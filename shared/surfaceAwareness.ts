import { z } from 'zod'

// Surface Awareness Contract — a serialized snapshot of the surface the writer is on,
// so agents can ground answers in "this question", "your last answer", "the next thing".
// Intake surfaces are the Story Coach document-question pages. The Script `editor`
// variant can be added later as an additive union member when that surface is built.

export const SurfaceIdSchema = z.enum(['outline', 'synopsis', 'treatment', 'story-bible'])
export type SurfaceId = z.infer<typeof SurfaceIdSchema>

export const SurfaceFormatSchema = z.enum(['feature', 'series'])
export type SurfaceFormat = z.infer<typeof SurfaceFormatSchema>

export const SurfaceQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  helper: z.string(),
  status: z.enum(['unanswered', 'answered']),
})
export type SurfaceQuestion = z.infer<typeof SurfaceQuestionSchema>

const SurfaceAwarenessUnion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('intake'),
    surface: SurfaceIdSchema,
    surfaceTitle: z.string(),
    format: SurfaceFormatSchema,
    questions: z.array(SurfaceQuestionSchema),
    nextQuestion: SurfaceQuestionSchema.nullable(),
    selectionSource: z.literal('first_unanswered'),
    answeredCount: z.number().int(),
    totalCount: z.number().int(),
    nextRecommendedAction: z.enum(['answer_next_question', 'all_answered']),
  }),
])

// Cross-field invariants for the intake variant. Note: nextQuestion intentionally stays
// non-null even when all questions are answered (it anchors to the first card), so this
// does NOT require null-when-complete.
export const SurfaceAwarenessSchema = SurfaceAwarenessUnion.superRefine((value, ctx) => {
  if (value.kind !== 'intake') return
  if (value.totalCount !== value.questions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalCount'], message: 'totalCount must equal questions.length' })
  }
  if (value.answeredCount < 0 || value.answeredCount > value.totalCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answeredCount'], message: 'answeredCount must be between 0 and totalCount' })
  }
})
export type SurfaceAwareness = z.infer<typeof SurfaceAwarenessSchema>
