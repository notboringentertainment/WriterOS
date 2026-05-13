import { describe, expect, it } from 'vitest'
import {
  VOICE_PROFILE_ASSESSMENT_QUESTIONS,
  VOICE_PROFILE_ASSESSMENT_SECTIONS,
  cleanAssessmentAnswers,
  countAnsweredAssessmentQuestions,
} from '../../client/src/lib/voiceProfileAssessment'

describe('Voice Profile assessment model', () => {
  it('keeps the MVP assessment at twenty questions', () => {
    expect(VOICE_PROFILE_ASSESSMENT_QUESTIONS).toHaveLength(20)
    expect(VOICE_PROFILE_ASSESSMENT_SECTIONS.map(section => section.id)).toEqual([
      'origins',
      'character',
      'conflict-tone',
      'world-symbol',
      'voice-craft',
      'engine',
      'collaboration',
    ])
  })

  it('keeps the engine question in the warmed-up sixth section', () => {
    const engine = VOICE_PROFILE_ASSESSMENT_SECTIONS.find(section => section.id === 'engine')
    expect(engine?.questions[0]).toMatchObject({
      id: 'q16',
      text: expect.stringContaining('Why do you write?'),
    })
  })

  it('counts only answered assessment questions', () => {
    expect(countAnsweredAssessmentQuestions({
      q1: 'An image.',
      q2: '   ',
      q99: 'Out of range.',
    })).toBe(1)
  })

  it('cleans draft answers before storage', () => {
    expect(cleanAssessmentAnswers({
      q1: '  A character under pressure.  ',
      q2: '',
      q3: '   ',
    })).toEqual({ q1: 'A character under pressure.' })
  })
})
