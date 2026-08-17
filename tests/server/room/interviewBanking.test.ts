import { describe, expect, it } from 'vitest';
import { buildBankPreview, buildPendingMeetingDecisions, renderBankedConceptSeed, renderOpenQuestionsBlock, renderStoryLocksBlock } from '../../../server/room/interview/banking';
import type { InterviewSessionRow, MeetingDecisionRow, TranscriptEntry } from '../../../server/room/interview/types';
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
    bank_snapshot: null,
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

const adoptedEnding: InterviewProposalRow = {
  ...adoptedLock,
  id: 'p-ending',
  field_path: 'interview_answer.morgan-ending',
  proposed_value: 'Mara takes over the restaurant and burns the old menu.',
  resolved_value: null,
  question_id: 'morgan-ending',
};

describe('Project Meeting banking', () => {
  it('builds deterministic assertions, revision ops, redirects, and a complete direction diff', () => {
    const prior: MeetingDecisionRow = {
      id: '11111111-1111-4111-8111-111111111111', project_id: 'p1', session_id: 'old',
      area: 'locks', field_path: 'story_locks', op: 'assert', targets: [],
      content: { statement: 'Old lock.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
      created_at: '2026-07-01T00:00:00Z',
    };
    const input = {
      session: { ...session(), cursor: { lane: null, question_id: null, budgets_spent: {}, redirects: [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-08T00:10:00Z', answered_at: null }] } },
      proposals: [adoptedOpen],
      mutability: { 'p-open': 'open' as const },
      existingDecisions: [prior],
      operations: [{ op: 'revise' as const, targetId: prior.id, statement: 'New lock.' }],
    };

    const first = buildPendingMeetingDecisions(input);
    const second = buildPendingMeetingDecisions(input);

    expect(first).toEqual(second);
    expect(first.pendingDecisions.map((entry) => entry.op)).toEqual(['assert', 'revise', 'redirect']);
    expect(first.directionDiff).toEqual([
      { area: 'open_questions', before: [], after: ['Who buys the restaurant if Mara fails?'], op: 'assert' },
      { area: 'locks', before: ['Old lock.'], after: ['New lock.'], op: 'revise' },
    ]);
  });

  it('keeps without a ledger entry and rejects revision targets synthesized only for legacy reads', () => {
    const legacy: MeetingDecisionRow = {
      id: 'legacy:old:p-lock', project_id: 'p1', session_id: 'old', area: 'locks', field_path: 'story_locks',
      op: 'assert', targets: [], content: { statement: 'Legacy lock.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
      created_at: '2026-07-01T00:00:00Z',
    };
    expect(buildPendingMeetingDecisions({ session: session(), proposals: [], mutability: {}, existingDecisions: [legacy], operations: [{ op: 'keep', targetId: legacy.id }] }).pendingDecisions).toEqual([]);
    expect(() => buildPendingMeetingDecisions({ session: session(), proposals: [], mutability: {}, existingDecisions: [legacy], operations: [{ op: 'retract', targetId: legacy.id }] })).toThrow(/backfill/i);
  });

  it('banks seed-color and delegated transcript entries as active direction assertions', () => {
    const withTranscript = session([
      { question_id: 'q-color', lane: 'sam', answer_text: 'Keep the humor bone dry.', origin: 'seed', disposition: 'seed_color', at: '2026-07-08T00:20:00Z' },
      { question_id: 'q-open', question_text: 'Who betrays Mara?', lane: 'morgan', answer_text: 'delegated', origin: null, disposition: 'skipped_delegated', at: '2026-07-08T00:21:00Z' },
    ]);
    const result = buildPendingMeetingDecisions({ session: withTranscript, proposals: [], mutability: {}, existingDecisions: [], operations: [] });
    expect(result.pendingDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'assert', area: 'question:q-color', content: expect.objectContaining({ statement: 'Keep the humor bone dry.', disposition: 'seed_color', mutability: 'leaning' }) }),
      expect.objectContaining({ op: 'assert', area: 'question:q-open', content: expect.objectContaining({ statement: 'Delegated to the room: Who betrays Mara?', disposition: 'skipped_delegated', mutability: 'open' }) }),
    ]));
  });

  it('builds retract and multi-target supersede entries without mutating prior decisions', () => {
    const first: MeetingDecisionRow = {
      id: '11111111-1111-4111-8111-111111111111', project_id: 'p1', session_id: 'old', area: 'locks', field_path: 'story_locks', op: 'assert', targets: [],
      content: { statement: 'First.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' }, created_at: '2026-07-01T00:00:00Z',
    };
    const second: MeetingDecisionRow = { ...first, id: '22222222-2222-4222-8222-222222222222', area: 'ending', content: { statement: 'Second.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' } };
    const originals = structuredClone([first, second]);
    const retracted = buildPendingMeetingDecisions({ session: session(), proposals: [], mutability: {}, existingDecisions: [first], operations: [{ op: 'retract', targetId: first.id }] });
    expect(retracted.pendingDecisions[0]).toMatchObject({ op: 'retract', targets: [first.id], content: {} });
    const superseded = buildPendingMeetingDecisions({ session: session(), proposals: [], mutability: {}, existingDecisions: [first, second], operations: [{ op: 'supersede', targetIds: [first.id, second.id], area: 'ending', fieldPath: 'story_locks', statement: 'Combined.', mutability: 'locked' }] });
    expect(superseded.pendingDecisions[0]).toMatchObject({ op: 'supersede', targets: [first.id, second.id], content: expect.objectContaining({ statement: 'Combined.' }) });
    expect(superseded.activeDirection.map((row) => 'statement' in row.content ? row.content.statement : '')).toEqual(['Combined.']);
    expect([first, second]).toEqual(originals);
  });

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
    expect(renderOpenQuestionsBlock(preview)).toBe('Nothing delegated — writer holds all intent.');
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

  it('routes known Morgan ending answers to locks instead of open questions by default', () => {
    const preview = buildBankPreview({ session: session(), proposals: [adoptedEnding], mutability: {} });

    expect(preview.locks).toEqual(['[SEED] Mara takes over the restaurant and burns the old menu.']);
    expect(preview.openQuestions).toEqual([]);
    expect(preview.conceptSeedAppend).toContain('### Locks\n[SEED] Mara takes over the restaurant and burns the old menu.');
  });

  it('exposes taggable answers with server-owned default mutability', () => {
    const preview = buildBankPreview({ session: session(), proposals: [adoptedLock, adoptedOpen, adoptedEnding], mutability: {} });

    expect(preview.taggable).toEqual([
      {
        proposalId: 'p-lock',
        questionId: 'morgan-locks',
        value: 'Never become cynical.',
        origin: 'seed',
        defaultMutability: 'locked',
        applied: 'locked',
      },
      {
        proposalId: 'p-open',
        questionId: 'morgan-open-questions',
        value: 'Who buys the restaurant if Mara fails?',
        origin: 'seed',
        defaultMutability: 'open',
        applied: 'open',
      },
      {
        proposalId: 'p-ending',
        questionId: 'morgan-ending',
        value: 'Mara takes over the restaurant and burns the old menu.',
        origin: 'seed',
        defaultMutability: 'locked',
        applied: 'locked',
      },
    ]);
  });

  it('taggable applied reflects writer overrides while defaults stay server-owned', () => {
    const preview = buildBankPreview({ session: session(), proposals: [adoptedLock, adoptedOpen], mutability: { 'p-lock': 'leaning', 'p-open': 'locked' } });

    const byId = Object.fromEntries(preview.taggable.map(item => [item.proposalId, item]));
    expect(byId['p-lock']).toMatchObject({ defaultMutability: 'locked', applied: 'leaning' });
    expect(byId['p-open']).toMatchObject({ defaultMutability: 'open', applied: 'locked' });
    expect(preview.leanings).toEqual(['[SEED] Never become cynical. — challenge permitted']);
    expect(preview.locks).toEqual(['[SEED] Who buys the restaurant if Mara fails?']);
    expect(preview.openQuestions).toEqual([]);
  });
});
