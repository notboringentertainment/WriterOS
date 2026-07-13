import { describe, expect, it } from 'vitest';
import {
  InvalidLockSectionsError,
  MEETING_HEADER,
  NONE_DECLARED,
  SURFACE_HEADER,
  adoptLegacyLocks,
  classifyLegacyLocks,
  containsReservedLockHeader,
  mergeLockSection,
  mergeMeetingLocks,
  parseLockSections,
  renderLockSections,
} from '../../../server/room/lockSections';

const SENTINEL = renderLockSections({ surface: NONE_DECLARED, meeting: NONE_DECLARED });

describe('renderLockSections / parseLockSections', () => {
  it('round-trips the canonical two-section value', () => {
    const rendered = renderLockSections({ surface: '- No resurrections', meeting: '[SEED] Ending is fixed' });
    expect(rendered).toBe(`${SURFACE_HEADER}\n- No resurrections\n\n${MEETING_HEADER}\n[SEED] Ending is fixed`);
    expect(parseLockSections(rendered)).toEqual({ surface: '- No resurrections', meeting: '[SEED] Ending is fixed' });
  });

  it('parses the sentinel as two empty-meaning sections', () => {
    expect(parseLockSections(SENTINEL)).toEqual({ surface: NONE_DECLARED, meeting: NONE_DECLARED });
  });

  it('returns null for sectionless legacy values', () => {
    expect(parseLockSections('- Ace lives')).toBeNull();
    expect(parseLockSections('')).toBeNull();
  });

  it('does not split on header text embedded inside a larger line', () => {
    const rendered = renderLockSections({ surface: '- Ace lives\n## Meeting locks is a phrase in the bible', meeting: '[SEED] fixed' });
    expect(parseLockSections(rendered)).toEqual({
      surface: '- Ace lives\n## Meeting locks is a phrase in the bible',
      meeting: '[SEED] fixed',
    });
  });

  it('fails loudly when a header appears more than once', () => {
    const dup = `${SURFACE_HEADER}\n- Ace lives\n${MEETING_HEADER}\n[SEED] a\n${MEETING_HEADER}\n[SEED] b`;
    expect(() => parseLockSections(dup)).toThrow(InvalidLockSectionsError);
  });

  it('fails loudly on partial canonical structure instead of adopting it as legacy', () => {
    expect(() => parseLockSections(`${SURFACE_HEADER}\n- Ace lives`)).toThrow(InvalidLockSectionsError);
  });
});

describe('containsReservedLockHeader', () => {
  it('true when any line is exactly a reserved header', () => {
    expect(containsReservedLockHeader(`some text\n${MEETING_HEADER}\nmore`)).toBe(true);
    expect(containsReservedLockHeader(SURFACE_HEADER)).toBe(true);
  });

  it('false when the header only appears as a substring of a line', () => {
    expect(containsReservedLockHeader('the ## Meeting locks reference in prose')).toBe(false);
    expect(containsReservedLockHeader('- Ace lives')).toBe(false);
  });
});

describe('classifyLegacyLocks / adoptLegacyLocks (B6)', () => {
  it('classifies [SEED]/[EXTRAPOLATED]/[INVENTED] values as meeting-origin (full A8 set)', () => {
    expect(classifyLegacyLocks('[SEED] Interview answer, 2026-07-01: ending fixed')).toBe('meeting');
    expect(classifyLegacyLocks('[EXTRAPOLATED] tone locked')).toBe('meeting');
    expect(classifyLegacyLocks('[INVENTED] the lighthouse is sentient')).toBe('meeting');
  });

  it('classifies everything else as surface-origin', () => {
    expect(classifyLegacyLocks('- Ace lives\n- Tone stays noir')).toBe('surface');
  });

  it('adopts by origin, other section starts None declared.', () => {
    expect(adoptLegacyLocks('[SEED] ending fixed')).toEqual({ surface: NONE_DECLARED, meeting: '[SEED] ending fixed' });
    expect(adoptLegacyLocks('- Ace lives')).toEqual({ surface: '- Ace lives', meeting: NONE_DECLARED });
  });

  it('treats blank and legacy empty-bank prose as fully empty, not writer locks', () => {
    for (const legacyEmpty of ['', '   ', 'No locks — writer cedes broadly', 'No locks — writer cedes broadly.']) {
      expect(adoptLegacyLocks(legacyEmpty)).toEqual({ surface: NONE_DECLARED, meeting: NONE_DECLARED });
    }
  });

  it('adoption is idempotent: adopting an already-adopted value changes nothing', () => {
    const once = renderLockSections(adoptLegacyLocks('[SEED] ending fixed'));
    expect(mergeLockSection(once, 'surface', NONE_DECLARED)).toBe(once);
  });
});

describe('mergeLockSection (B3 clobber prevention)', () => {
  it('surface write rewrites only the surface section', () => {
    const current = renderLockSections({ surface: 'old surface', meeting: '[SEED] keep me' });
    expect(parseLockSections(mergeLockSection(current, 'surface', '- new lock'))).toEqual({
      surface: '- new lock',
      meeting: '[SEED] keep me',
    });
  });

  it('meeting write rewrites only the meeting section', () => {
    const current = renderLockSections({ surface: '- keep me too', meeting: '[SEED] old' });
    expect(parseLockSections(mergeLockSection(current, 'meeting', '[SEED] new'))).toEqual({
      surface: '- keep me too',
      meeting: '[SEED] new',
    });
  });

  it('legacy [SEED] locks survive the first post-contract surface write (B7 regression)', () => {
    const legacy = '[SEED] Interview answer, 2026-07-01: the ending is fixed';
    expect(parseLockSections(mergeLockSection(legacy, 'surface', '- bible lock'))).toEqual({
      surface: '- bible lock',
      meeting: legacy,
    });
  });

  it('empty body writes None declared., never an empty section', () => {
    expect(parseLockSections(mergeLockSection(SENTINEL, 'surface', '  '))).toEqual({
      surface: NONE_DECLARED,
      meeting: NONE_DECLARED,
    });
  });
});

describe('mergeMeetingLocks (round preservation)', () => {
  const round1 = renderLockSections({ surface: '- Ace lives', meeting: '[SEED] ending fixed' });

  it('appends new meeting locks to existing ones', () => {
    const merged = mergeMeetingLocks(round1, ['[EXTRAPOLATED] tone locked']);
    expect(parseLockSections(merged)).toEqual({
      surface: '- Ace lives',
      meeting: '[SEED] ending fixed\n[EXTRAPOLATED] tone locked',
    });
  });

  it('banking with no new locks preserves the existing Meeting section', () => {
    expect(mergeMeetingLocks(round1, [])).toBe(round1);
  });

  it('exact duplicate locks do not multiply', () => {
    const merged = mergeMeetingLocks(round1, ['[SEED] ending fixed', '[SEED] ending fixed']);
    expect(parseLockSections(merged)!.meeting).toBe('[SEED] ending fixed');
  });

  it('replaces None declared. instead of appending under it', () => {
    const merged = mergeMeetingLocks(SENTINEL, ['[SEED] first lock']);
    expect(parseLockSections(merged)).toEqual({ surface: NONE_DECLARED, meeting: '[SEED] first lock' });
  });

  it('adopts legacy values before merging', () => {
    const merged = mergeMeetingLocks('- Ace lives', ['[SEED] new']);
    expect(parseLockSections(merged)).toEqual({ surface: '- Ace lives', meeting: '[SEED] new' });
  });

  it('strips answer-derived lines that are exactly a reserved header before merging', () => {
    const merged = mergeMeetingLocks(round1, [MEETING_HEADER, SURFACE_HEADER, '[SEED] real lock']);
    expect(parseLockSections(merged)).toEqual({
      surface: '- Ace lives',
      meeting: '[SEED] ending fixed\n[SEED] real lock',
    });
  });

  it('strips reserved physical lines embedded inside multiline Meeting content', () => {
    const merged = mergeMeetingLocks(round1, [`[SEED] first line\n${MEETING_HEADER}\nsecond line`]);
    expect(parseLockSections(merged)!.meeting).toBe('[SEED] ending fixed\n[SEED] first line\nsecond line');
  });
});
