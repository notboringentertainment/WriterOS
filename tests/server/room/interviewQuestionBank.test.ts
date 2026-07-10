import { describe, expect, it } from 'vitest';
import { QUESTION_BANK, selectQuestionsForAudit } from '../../../server/room/interview/questionBank';

const thinRequiredAudit = {
  locks: 'THIN',
  ending: 'THIN',
  open_questions: 'THIN',
  load_bearing_character: 'THIN',
} as const;

describe('Project Meeting question bank traceability contract', () => {
  it('encodes every A6 row with trigger, target, template destination, origin, requirement, and budget', () => {
    expect(QUESTION_BANK).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'morgan-locks', lane: 'morgan', trigger: 'locks', writerOSTarget: 'story_locks', templateDestination: '## Locks — do not violate', originOnConfirm: 'seed', requirement: 'required', budget: 2 }),
        expect.objectContaining({ id: 'morgan-ending', lane: 'morgan', trigger: 'ending', writerOSTarget: 'story_locks|open_questions', templateDestination: '## Locks / ## Open questions — invent here', requirement: 'required', budget: 1 }),
        expect.objectContaining({ id: 'morgan-open-questions', lane: 'morgan', trigger: 'open_questions', writerOSTarget: 'open_questions', templateDestination: '## Open questions — invent here', originOnConfirm: 'delegation', requirement: 'required', budget: 1 }),
        expect.objectContaining({ id: 'casey-load-bearing-character', lane: 'casey', trigger: 'load_bearing_character', writerOSTarget: 'storyBible.characters[x].{flaw,secret,want,need}', templateDestination: '## Seed', requirement: 'required', budget: 4 }),
        expect.objectContaining({ id: 'zoe-world-rules', lane: 'zoe', trigger: 'world_rules', requirement: 'conditional_required', budget: 3 }),
        expect.objectContaining({ id: 'sam-premise-identity', lane: 'sam', requirement: 'optional' }),
        expect.objectContaining({ id: 'oliver-stakes-engine', lane: 'oliver', requirement: 'optional' }),
        expect.objectContaining({ id: 'maya-voice-texture', lane: 'maya', requirement: 'optional' }),
        expect.objectContaining({ id: 'alex-format-scope', lane: 'alex', requirement: 'optional' }),
      ]),
    );

    for (const row of QUESTION_BANK) {
      expect(row.question.trim()).not.toBe('');
      expect(row.trigger.trim()).not.toBe('');
      expect(row.writerOSTarget.trim()).not.toBe('');
      expect(row.templateDestination.trim()).not.toBe('');
      expect(row.budget).toBeGreaterThan(0);
    }
  });

  it('selects only THIN required rows and benches Zoe when the project is not speculative', () => {
    const selected = selectQuestionsForAudit({ audit: thinRequiredAudit, mode: 'full', speculative: false });

    expect(selected.map(q => q.id)).toEqual([
      'morgan-locks',
      'morgan-ending',
      'morgan-open-questions',
      'casey-load-bearing-character',
    ]);
    expect(selected.some(q => q.lane === 'zoe')).toBe(false);
    expect(selected.some(q => q.requirement === 'optional')).toBe(false);
  });

  it('asks zero questions when every audited required area is SUFFICIENT', () => {
    const selected = selectQuestionsForAudit({
      audit: { locks: 'SUFFICIENT', ending: 'SUFFICIENT', open_questions: 'SUFFICIENT', load_bearing_character: 'SUFFICIENT' },
      mode: 'full',
      speculative: false,
    });

    expect(selected).toHaveLength(0);
  });

  it('collapses quick mode to Morgan-owned required questions at one per THIN area', () => {
    const selected = selectQuestionsForAudit({ audit: thinRequiredAudit, mode: 'quick', speculative: false });

    expect(selected).toHaveLength(4);
    expect(selected.every(q => q.lane === 'morgan')).toBe(true);
    expect(selected.map(q => q.trigger)).toEqual(['locks', 'ending', 'open_questions', 'load_bearing_character']);
    expect(selected.every(q => q.budget === 1)).toBe(true);
  });

  it('preserves quick-mode lane override in returned question objects', () => {
    const selected = selectQuestionsForAudit({ audit: thinRequiredAudit, mode: 'quick', speculative: false });

    for (const question of selected) {
      expect(question.lane).toBe('morgan');
    }
  });
});
