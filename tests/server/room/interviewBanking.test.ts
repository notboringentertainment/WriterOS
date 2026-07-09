import { describe, expect, it } from 'vitest';
import { buildBankPreview, renderBankedConceptSeed, renderOpenQuestionsBlock, renderStoryLocksBlock } from '../../../server/room/interview/banking';
import type { InterviewSessionRow, TranscriptEntry } from '../../../server/room/interview/types';
import type { InterviewProposalRow } from '../../../server/room/interview/types';

function session(answers: TranscriptEntry[] = []): InterviewSessionRow {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state: 'readback',
    seed_text: 'A grieving chef returns home.',
    audit: { locks: 'THIN', ending: 'THIN', open_questions: 'THIN', load_bearing_character: 'THIN' },
    cursor: { lane: null, question_id: null, budgets_spent: {} },
    answers,
    created_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
  };
}

const adoptedLock: InterviewProposalRow = {
  id: 'p-lock',
  project_id: 'p1',
  agent_id: 'morgan',
  surface: 'memory',
  field_path: 'story_locks',
  proposed_value: 'Never become a cynical ghost-hunt.',
  resolved_value: 'Never become cynical.',
  rationale: 'writer stated a hard constraint',
  status: 'adopted',
  resolved_at: '2026-07-08T01:00:00Z',
  kind: 'interview_answer',
  session_id: 's1',
  question_id: 'morgan-locks',
  origin: 'seed',
  created_at: '2026-07-08T00:30:00Z',
};

const adoptedOpen: InterviewProposalRow = {
  ...adoptedLock,
  id: 'p-open',
  field_path: 'open_questions',
  proposed_value: 'Who buys the restaurant if Mara fails?',
  resolved_value: null,
  question_id: 'morgan-open-questions',
};

describe('First Meeting banking', () => {
  it('builds a visible preview before writing memory blocks', () => {
    const preview = buildBankPreview({ session: session(), proposals: [adoptedLock, adoptedOpen], mutability: { 'p-lock': 'locked', 'p-open': 'open' } });

    expect(preview.seedText).toBe('A grieving chef returns home.');
    expect(preview.locks).toEqual(['[SEED] Never become cynical.']);
    expect(preview.openQuestions).toEqual(['Who buys the restaurant if Mara fails?']);
    expect(preview.conceptSeedAppend).toContain('A grieving chef returns home.');
    expect(preview.conceptSeedAppend).toContain('[SEED] Never become cynical.');
  });

  it('uses explicit empty state lines only when locks or open questions are empty', () => {
    const preview = buildBankPreview({ session: session(), proposals: [], mutability: {} });

    expect(renderStoryLocksBlock(preview)).toBe('No locks — writer cedes broadly');
    expect(renderOpenQuestionsBlock(preview)).toBe('Nothing delegated — writer holds all intent');
  });

  it('preserves refused mappings as seed color in the concept seed append', () => {
    const refused = session([{ question_id: 'casey-load-bearing-character', lane: 'casey', answer_text: 'Do not put this in a field, just keep the color.', origin: 'seed', disposition: 'seed_color', at: '2026-07-08T02:00:00Z' }]);

    const conceptSeed = renderBankedConceptSeed(buildBankPreview({ session: refused, proposals: [], mutability: {} }));

    expect(conceptSeed).toContain('[SEED] Interview answer, 2026-07-08: Do not put this in a field, just keep the color.');
  });

  it('renders skipped/delegated answers without origin tags', () => {
    const skipped = session([{ question_id: 'morgan-open-questions', lane: 'morgan', answer_text: 'Writer skipped/delegated this area to the room.', origin: null, disposition: 'skipped_delegated', at: '2026-07-08T02:00:00Z' }]);

    const preview = buildBankPreview({ session: skipped, proposals: [], mutability: {} });

    expect(preview.seedColor).toEqual(['Interview answer, 2026-07-08: Writer skipped/delegated this area to the room.']);
  });

  it('writer mutability decision overrides default open-question routing', () => {
    const preview = buildBankPreview({ session: session(), proposals: [adoptedOpen], mutability: { 'p-open': 'locked' } });

    expect(preview.locks).toEqual(['[SEED] Who buys the restaurant if Mara fails?']);
    expect(preview.openQuestions).toEqual([]);
  });
});
