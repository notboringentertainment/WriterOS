import { describe, expect, it } from 'vitest'
import { SurfaceAwarenessSchema } from '../../shared/surfaceAwareness'

const question = { id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' as const }

const intake = {
  kind: 'intake' as const,
  surface: 'outline' as const,
  surfaceTitle: 'Outline',
  format: 'feature' as const,
  questions: [question],
  nextQuestion: question,
  selectionSource: 'first_unanswered' as const,
  answeredCount: 0,
  totalCount: 1,
  nextRecommendedAction: 'answer_next_question' as const,
}

describe('SurfaceAwarenessSchema', () => {
  it('validates the none variant', () => {
    expect(SurfaceAwarenessSchema.safeParse({ kind: 'none' }).success).toBe(true)
  })

  it('validates a well-formed intake variant', () => {
    const parsed = SurfaceAwarenessSchema.safeParse(intake)
    expect(parsed.success).toBe(true)
  })

  it('allows nextQuestion to be null (all answered)', () => {
    const allAnswered = {
      ...intake,
      questions: [{ ...question, status: 'answered' as const }],
      nextQuestion: null,
      answeredCount: 1,
      nextRecommendedAction: 'all_answered' as const,
    }
    expect(SurfaceAwarenessSchema.safeParse(allAnswered).success).toBe(true)
  })

  it('rejects an unknown kind', () => {
    expect(SurfaceAwarenessSchema.safeParse({ kind: 'editor' }).success).toBe(false)
  })

  it('rejects an intake variant missing required fields', () => {
    const { questions: _omit, ...broken } = intake
    expect(SurfaceAwarenessSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects an invalid question status', () => {
    const bad = { ...intake, questions: [{ ...question, status: 'maybe' }] }
    expect(SurfaceAwarenessSchema.safeParse(bad).success).toBe(false)
  })
})
