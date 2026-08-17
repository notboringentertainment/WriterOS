import { describe, expect, it } from 'vitest';
import { auditSeed, formatAuditMessage } from '../../../server/room/interview/audit';
import { selectQuestionsForAudit } from '../../../server/room/interview/questionBank';

describe('Project Meeting audit engine', () => {
  it('marks a thin one-sentence seed as THIN in required areas and asks only those areas', () => {
    const audit = auditSeed('A grieving chef returns home to save a haunted restaurant.', { speculative: false });

    expect(audit.verdicts).toMatchObject({
      locks: 'THIN',
      ending: 'THIN',
      open_questions: 'THIN',
      load_bearing_character: 'THIN',
    });
    const selected = selectQuestionsForAudit({ audit: audit.verdicts, mode: 'full', speculative: false });
    expect(selected.map(q => q.trigger)).toEqual(['locks', 'ending', 'open_questions', 'load_bearing_character']);
  });

  it('asks zero targeted questions for a rich seed that satisfies the required audit areas', () => {
    const richSeed = [
      'Title: Hearth Ghosts.',
      'Lock: this story must never become a cynical ghost-hunt; grief stays tender.',
      'Open questions: the room may invent the identity of the first buyer and surprise me there.',
      'Backstory: Mara broke with her sister before page one because she hid their mother\'s debt; she wants forgiveness but needs to accept help.',
      'Ending: it ends with Mara keeping the restaurant open and explicitly choosing her sister over the sale.',
    ].join('\n');

    const audit = auditSeed(richSeed, { speculative: false });
    expect(audit.verdicts).toEqual({
      locks: 'SUFFICIENT',
      ending: 'SUFFICIENT',
      open_questions: 'SUFFICIENT',
      load_bearing_character: 'SUFFICIENT',
    });
    expect(selectQuestionsForAudit({ audit: audit.verdicts, mode: 'full', speculative: false })).toHaveLength(0);
  });

  it('adds Zoe world-rules only for speculative projects', () => {
    const nonSpec = auditSeed('A witch opens a door to a city under the ocean.', { speculative: false });
    const spec = auditSeed('A witch opens a door to a city under the ocean.', { speculative: true });

    expect(nonSpec.verdicts).not.toHaveProperty('world_rules');
    expect(spec.verdicts).toHaveProperty('world_rules', 'THIN');
    expect(selectQuestionsForAudit({ audit: spec.verdicts, mode: 'full', speculative: true }).map(q => q.id)).toContain('zoe-world-rules');
  });

  it('uses new-seed coverage before active-direction coverage', () => {
    const audit = auditSeed('Ending: it ends with Mara choosing her sister.', {
      speculative: false,
      context: {
        activeDecisions: [],
        priorAnswers: [],
        storyLocks: '',
        openQuestions: '',
        coveredAreas: new Set(['ending']),
      },
    });

    expect(audit.verdicts.ending).toBe('SUFFICIENT');
  });

  it('marks active prior coverage as SUFFICIENT_FROM_PRIOR and suppresses its question', () => {
    const audit = auditSeed('', {
      speculative: false,
      context: {
        activeDecisions: [],
        priorAnswers: [],
        storyLocks: '',
        openQuestions: '',
        coveredAreas: new Set(['ending']),
      },
    });

    expect(audit.verdicts.ending).toBe('SUFFICIENT_FROM_PRIOR');
    expect(selectQuestionsForAudit({ audit: audit.verdicts, mode: 'full', speculative: false }).map(q => q.trigger)).not.toContain('ending');
  });

  it('formats visible Morgan audit results instead of hiding the grade', () => {
    const message = formatAuditMessage({ locks: 'SUFFICIENT', ending: 'THIN', open_questions: 'THIN', load_bearing_character: 'SUFFICIENT' });

    expect(message).toContain('Morgan audit');
    expect(message).toContain('locks: SUFFICIENT');
    expect(message).toContain('ending: THIN');
  });
});
