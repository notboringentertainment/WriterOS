import { describe, expect, it, vi } from 'vitest';

import { buildAuditContext } from '../../../server/room/interview/auditContext';
import type {
  InterviewProposalRow,
  InterviewSessionRow,
  MeetingDecisionRow,
} from '../../../server/room/interview/types';

function session(input: Partial<InterviewSessionRow> = {}): InterviewSessionRow {
  return {
    id: input.id ?? 'session-1',
    project_id: 'project-1',
    mode: 'full',
    state: input.state ?? 'banked',
    seed_text: '',
    audit: {},
    cursor: { lane: null, question_id: null, budgets_spent: {} },
    answers: input.answers ?? [{
      question_id: 'morgan-locks',
      question_text: 'What is forbidden?',
      domain: 'locks',
      lane: 'morgan',
      answer_text: 'Never become a spoof.',
      origin: 'seed',
      disposition: 'field_mapped',
      at: '2026-07-14T00:00:00Z',
    }],
    bank_snapshot: input.bank_snapshot ?? {
      applied_classifications: { 'proposal-1': 'locked' },
      open_questions: [],
      legacy_open_questions: [],
    },
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:01:00Z',
  };
}

function proposal(input: Partial<InterviewProposalRow> = {}): InterviewProposalRow {
  return {
    id: input.id ?? 'proposal-1',
    project_id: 'project-1',
    agent_id: 'morgan',
    surface: 'memory',
    field_path: input.field_path ?? 'story_locks',
    proposed_value: input.proposed_value ?? 'Never become a spoof.',
    resolved_value: input.resolved_value ?? null,
    rationale: 'Meeting answer',
    status: 'adopted',
    resolved_at: '2026-07-14T00:00:00Z',
    kind: 'interview_answer',
    session_id: input.session_id ?? 'session-1',
    question_id: input.question_id ?? 'morgan-locks',
    origin: input.origin ?? 'seed',
    created_at: '2026-07-14T00:00:00Z',
  };
}

describe('buildAuditContext', () => {
  it('derives legacy coverage in memory without writing ledger rows', async () => {
    const listMeetingDecisions = vi.fn(async () => [] as MeetingDecisionRow[]);
    const listInterviewProposals = vi.fn(async () => [proposal()]);

    const context = await buildAuditContext({
      projectId: 'project-1',
      sessions: [session()],
      storyLocks: '## Meeting locks\n[SEED] Never become a spoof.',
      openQuestions: 'Nothing delegated — writer holds all intent.',
    }, { listMeetingDecisions, listInterviewProposals });

    expect(context.coveredAreas).toContain('locks');
    expect(context.activeDecisions).toHaveLength(1);
    expect(context.activeDecisions[0]).toMatchObject({
      id: 'legacy:session-1:proposal-1',
      area: 'locks',
      field_path: 'story_locks',
      op: 'assert',
    });
    expect(context.activeDecisions[0].content).toMatchObject({
      statement: 'Never become a spoof.',
      mutability: 'locked',
      originMarker: '[SEED]',
    });
    expect(listMeetingDecisions).toHaveBeenCalledTimes(1);
    expect(listInterviewProposals).toHaveBeenCalledWith('session-1', 'adopted');
  });

  it('does not derive fallback rows for a session that already has ledger entries', async () => {
    const row: MeetingDecisionRow = {
      id: 'decision-1',
      project_id: 'project-1',
      session_id: 'session-1',
      area: 'ending',
      field_path: 'story_locks',
      op: 'assert',
      content: { statement: 'She leaves.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
      targets: [],
      created_at: '2026-07-14T00:00:00Z',
    };
    const listInterviewProposals = vi.fn(async () => [proposal()]);

    const context = await buildAuditContext({
      projectId: 'project-1',
      sessions: [session()],
      storyLocks: '',
      openQuestions: '',
    }, {
      listMeetingDecisions: async () => [row],
      listInterviewProposals,
    });

    expect(context.coveredAreas).toEqual(new Set(['ending']));
    expect(listInterviewProposals).not.toHaveBeenCalled();
  });

  it('removes retracted areas from active coverage while preserving prior answers', async () => {
    const decisions: MeetingDecisionRow[] = [
      {
        id: 'a', project_id: 'project-1', session_id: 'session-1', area: 'locks', field_path: 'story_locks', op: 'assert',
        content: { statement: 'Old lock', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' }, targets: [], created_at: '2026-07-14T00:00:00Z',
      },
      {
        id: 'b', project_id: 'project-1', session_id: 'session-2', area: 'locks', field_path: 'story_locks', op: 'retract',
        content: {}, targets: ['a'], created_at: '2026-07-14T00:01:00Z',
      },
    ];

    const context = await buildAuditContext({
      projectId: 'project-1',
      sessions: [session({ bank_snapshot: null })],
      storyLocks: 'surface value',
      openQuestions: 'open value',
    }, {
      listMeetingDecisions: async () => decisions,
      listInterviewProposals: async () => [],
    });

    expect(context.coveredAreas).not.toContain('locks');
    expect(context.priorAnswers).toHaveLength(1);
    expect(context.storyLocks).toBe('surface value');
    expect(context.openQuestions).toBe('open value');
  });
});
