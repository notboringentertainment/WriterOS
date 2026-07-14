import { describe, expect, it } from 'vitest';
import type { InterviewSessionRow } from '../../../server/room/interview/types';
import { DOMAIN_BY_TRIGGER, projectConceptSeed } from '../../../server/room/interview/conceptSeedProjection';

function session(overrides: Partial<InterviewSessionRow>): InterviewSessionRow {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state: 'banked',
    seed_text: 'A noir about a lighthouse keeper.',
    audit: {},
    cursor: { lane: null, question_id: null, budgets_spent: {} },
    answers: [],
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  } as InterviewSessionRow;
}

describe('DOMAIN_BY_TRIGGER', () => {
  it('maps every current question-bank trigger to a domain', () => {
    expect(DOMAIN_BY_TRIGGER).toEqual({
      locks: 'structure',
      ending: 'structure',
      open_questions: 'structure',
      load_bearing_character: 'character',
      world_rules: 'world',
      premise_identity: 'structure',
      stakes_engine: 'structure',
      voice_texture: 'dialogue',
      format_scope: 'scale',
    });
  });
});

describe('projectConceptSeed', () => {
  it('returns the sentinel when no sessions are banked', () => {
    expect(projectConceptSeed([])).toBe('No concept seed banked yet. Offer the Project Meeting.');
    expect(projectConceptSeed([session({ state: 'interviewing' })])).toBe(
      'No concept seed banked yet. Offer the Project Meeting.',
    );
  });

  it('opens with the founding seed and renders confirmed answers for a single round', () => {
    const s = session({
      answers: [
        {
          question_id: 'morgan-locks',
          question_text: "What's the one thing this story is not allowed to become?",
          domain: 'structure',
          lane: 'morgan',
          answer_text: 'Never a cynical ghost-hunt.',
          origin: 'seed',
          disposition: 'field_mapped',
          at: '2026-07-01T00:10:00Z',
        },
      ],
    });
    const out = projectConceptSeed([s]);
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('A noir about a lighthouse keeper.');
    expect(out).toContain('[SEED]');
    expect(out).toContain('Never a cynical ghost-hunt.');
    expect(out.length).toBeLessThanOrEqual(4000);
  });

  it('is deterministic', () => {
    const s = session({});
    expect(projectConceptSeed([s])).toBe(projectConceptSeed([s]));
  });

  it('a 20k-char seed projects to <= 4000 with an intact truncation marker in the founding block', () => {
    const s = session({ seed_text: 'x'.repeat(20000) });
    const out = projectConceptSeed([s]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain('xxx');
    expect(out).toContain('[seed truncated — full text in the Meeting record]');
  });

  it('answers alone exceeding the cap are tail-dropped — and the founding seed still stands', () => {
    const answers = Array.from({ length: 200 }, (_, i) => ({
      question_id: `q${i}`,
      question_text: `Question number ${i}?`,
      lane: 'morgan',
      answer_text: `Answer ${i} with some meaningful length to overflow the budget.`,
      origin: 'seed' as const,
      disposition: 'field_mapped' as const,
      at: '2026-07-01T00:10:00Z',
    }));
    const out = projectConceptSeed([session({ answers })]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toMatch(/\+\d+ more answers — see Meeting record/);
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('A noir about a lighthouse keeper.');
  });

  it('per-round seed slice is reserved before answers (answers shorten it, never evict it)', () => {
    const answers = Array.from({ length: 100 }, (_, i) => ({
      question_id: `q${i}`,
      question_text: `Q${i}?`,
      lane: 'morgan',
      answer_text: `A${i} — long enough answer text to soak up the round budget quickly here.`,
      origin: 'seed' as const,
      disposition: 'field_mapped' as const,
      at: '2026-07-02T00:10:00Z',
    }));
    const round1 = session({ id: 'r1', created_at: '2026-06-01T00:00:00Z', seed_text: 'founding seed text' });
    const round2 = session({ id: 'r2', created_at: '2026-07-01T00:00:00Z', seed_text: 'w'.repeat(500), answers });
    const out = projectConceptSeed([round1, round2]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain('### Seed (verbatim excerpt)');
    expect(out).toContain('www');
  });

  it('renders newest round first, drops oldest whole rounds, announces the drop — founding seed survives', () => {
    const oldRound = session({ id: 'old', created_at: '2026-06-01T00:00:00Z', seed_text: 'y'.repeat(3000) });
    const newRound = session({ id: 'new', created_at: '2026-07-01T00:00:00Z', seed_text: 'z'.repeat(3000) });
    const out = projectConceptSeed([oldRound, newRound]);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.startsWith('## Founding seed —')).toBe(true);
    expect(out).toContain('yyy');
    expect(out).toContain('zzz');
    expect(out).toContain('round 2 of 2');
    expect(out).toContain('(1 earlier rounds in the Meeting record)');
    expect(out).not.toContain('round 1 of 2');
  });
});
