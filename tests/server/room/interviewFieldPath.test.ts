import { describe, expect, it } from 'vitest'
import { buildBankPreview } from '../../../server/room/interview/banking'
import type { InterviewProposalRow, InterviewSessionRow, TranscriptEntry } from '../../../server/room/interview/types'

function makeSession(answers: TranscriptEntry[] = []): InterviewSessionRow {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state: 'readback',
    seed_text: 'seed',
    audit: {},
    cursor: { lane: null, question_id: null, budgets_spent: {} },
    answers,
    bank_snapshot: null,
    created_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
  }
}

const baseProposal: InterviewProposalRow = {
  id: 'p1',
  project_id: 'p1',
  agent_id: 'casey',
  surface: 'storyBible',
  field_path: 'storyBible.characters[x].{flaw,secret,want,need}',
  proposed_value: 'value',
  rationale: 'rationale',
  status: 'adopted',
  resolved_at: null,
  resolved_value: null,
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'casey-load-bearing-character',
  origin: 'seed',
  created_at: '2026-07-08T00:00:00Z',
}

describe('interview field_path normalization', () => {
  it('does not leave composite writerOSTarget patterns as literal field_path', () => {
    const proposal: InterviewProposalRow = { ...baseProposal }
    const preview = buildBankPreview({ session: makeSession(), proposals: [proposal], mutability: {} })
    // Composite patterns are routed to open delegation instead of corrupting a
    // literal field_path. They still appear in the export as an open question or
    // dated answer, but never as storyBible.characters[x].{flaw,secret,want,need}.
    expect(preview.openQuestions).toContain('value')
  })

  it('keeps simple writerOSTargets as literal field_path', () => {
    const proposal: InterviewProposalRow = {
      ...baseProposal,
      field_path: 'story_locks',
      question_id: 'morgan-locks',
    }
    const preview = buildBankPreview({ session: makeSession(), proposals: [proposal], mutability: {} })
    expect(preview.locks).toContain('[SEED] value')
    expect(preview.openQuestions).toEqual([])
  })
})
