// Addendum B3/B6: the story_locks block is a canonical two-section value.
// Both sections are binding for enforcement; each writer may rewrite ONLY its
// own section. Legacy (sectionless, pre-contract) values are adopted at write
// time by whichever section writer touches the block first — the initializer
// preserves existing non-blank values verbatim (B6).
//
import type { MeetingDecisionRow } from './interview/types';

export const SURFACE_HEADER = '## Surface-declared locks';
export const MEETING_HEADER = '## Meeting locks';
export const NONE_DECLARED = 'None declared.';

export type LockSections = { surface: string; meeting: string };

export class InvalidLockSectionsError extends Error {
  constructor() {
    super('story_locks contains malformed reserved section headers');
    this.name = 'InvalidLockSectionsError';
  }
}

const LEGACY_EMPTY_VALUES = new Set(['No locks — writer cedes broadly', 'No locks — writer cedes broadly.']);

export function renderLockSections(sections: LockSections): string {
  return `${SURFACE_HEADER}\n${sections.surface}\n\n${MEETING_HEADER}\n${sections.meeting}`;
}

// Reserved headers are matched ONLY as exact full lines at line start — never
// as substrings of writer content. More than one occurrence of either header
// makes the value invalid (parse returns null → legacy-adopt/repair per B6,
// same as any malformed value).
export function containsReservedLockHeader(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line === SURFACE_HEADER || line === MEETING_HEADER);
}

export function parseLockSections(value: string): LockSections | null {
  const lines = value.split(/\r?\n/);
  const surfaceIdxs = lines.flatMap((line, i) => (line === SURFACE_HEADER ? [i] : []));
  const meetingIdxs = lines.flatMap((line, i) => (line === MEETING_HEADER ? [i] : []));
  // No reserved lines means sectionless legacy input. Any partial, duplicate,
  // or out-of-order canonical structure is malformed and must fail loudly —
  // never feed it through legacy adoption and silently change ownership.
  if (surfaceIdxs.length === 0 && meetingIdxs.length === 0) return null;
  if (surfaceIdxs.length !== 1 || meetingIdxs.length !== 1) throw new InvalidLockSectionsError();
  const surfaceAt = surfaceIdxs[0];
  const meetingAt = meetingIdxs[0];
  if (surfaceAt !== 0 || meetingAt <= surfaceAt) throw new InvalidLockSectionsError();
  const surface = lines.slice(surfaceAt + 1, meetingAt).join('\n').trim();
  const meeting = lines.slice(meetingAt + 1).join('\n').trim();
  return { surface: surface || NONE_DECLARED, meeting: meeting || NONE_DECLARED };
}

export function classifyLegacyLocks(value: string): 'meeting' | 'surface' {
  // Full A8 origin-marker set — meeting-origin lock lines can carry any of the three.
  return /\[SEED\]|\[EXTRAPOLATED\]|\[INVENTED\]/.test(value) ? 'meeting' : 'surface';
}

export function adoptLegacyLocks(value: string): LockSections {
  const trimmed = value.trim();
  if (!trimmed || LEGACY_EMPTY_VALUES.has(trimmed)) {
    return { surface: NONE_DECLARED, meeting: NONE_DECLARED };
  }
  return classifyLegacyLocks(trimmed) === 'meeting'
    ? { surface: NONE_DECLARED, meeting: trimmed }
    : { surface: trimmed, meeting: NONE_DECLARED };
}

function sectionsOf(current: string): LockSections {
  return parseLockSections(current) ?? adoptLegacyLocks(current);
}

export function mergeLockSection(current: string, origin: 'surface' | 'meeting', body: string): string {
  const sections = sectionsOf(current);
  if (containsReservedLockHeader(body)) throw new InvalidLockSectionsError();
  const nextBody = body.trim() || NONE_DECLARED;
  return renderLockSections(origin === 'surface' ? { ...sections, surface: nextBody } : { ...sections, meeting: nextBody });
}

export function mergeMeetingLocks(current: string, newLines: string[]): string {
  const sections = sectionsOf(current);
  const existing = sections.meeting === NONE_DECLARED ? [] : sections.meeting.split('\n');
  const seen = new Set(existing.map((l) => l.trim()));
  const additions = newLines
    // Sanitize PHYSICAL lines, not only array entries: a proposal value may be
    // multiline and hide a reserved header between ordinary lines.
    .flatMap((entry) => entry.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((l) => l && l !== SURFACE_HEADER && l !== MEETING_HEADER && !seen.has(l) && (seen.add(l), true));
  const merged = [...existing, ...additions];
  return renderLockSections({ ...sections, meeting: merged.length ? merged.join('\n') : NONE_DECLARED });
}

export function renderMeetingLocksFromDirection(current: string, activeDirection: readonly MeetingDecisionRow[]): string {
  const lines = activeDirection.flatMap((row) => {
    if (!('statement' in row.content) || row.content.mutability !== 'locked') return [];
    return `${row.content.originMarker} ${row.content.statement}`.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== SURFACE_HEADER && line !== MEETING_HEADER);
  });
  return mergeLockSection(current, 'meeting', lines.join('\n'));
}
