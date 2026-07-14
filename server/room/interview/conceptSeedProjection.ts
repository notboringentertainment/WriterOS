// Addendum B1 (as corrected): concept_seed is a deterministic bounded
// projection of the canonical Meeting record (interview_sessions). The record
// keeps the verbatim seed (<=20k) and full transcript; the block carries what
// fits in the agents' working context. The output is <= cap BY CONSTRUCTION —
// every piece is budgeted before it is added; there is no final blind slice.
// Honest bounds: answers drop from the tail with an omission marker, the seed
// excerpt truncates with a marker, dropped older rounds are announced.

import type { InterviewSessionRow, TranscriptEntry } from './types';

export const CONCEPT_SEED_SENTINEL = 'No concept seed banked yet. Offer the Project Meeting.';
const SEED_TRUNCATED = '… [seed truncated — full text in the Meeting record]';
const answersOmitted = (n: number) => `- … (+${n} more answers — see Meeting record)`;
const roundsOmitted = (n: number) => `… (${n} earlier rounds in the Meeting record)`;
const FOUNDING_SEED_RESERVE = 1000;
const ROUND_SEED_MIN = 200;

function excerpt(text: string, budget: number): string {
  if (text.length <= budget) return text;
  if (budget < SEED_TRUNCATED.length) return SEED_TRUNCATED.slice(0, Math.max(0, budget));
  return text.slice(0, budget - SEED_TRUNCATED.length) + SEED_TRUNCATED;
}

export const DOMAIN_BY_TRIGGER: Record<string, string> = {
  locks: 'structure',
  ending: 'structure',
  open_questions: 'structure',
  load_bearing_character: 'character',
  world_rules: 'world',
  premise_identity: 'structure',
  stakes_engine: 'structure',
  voice_texture: 'dialogue',
  format_scope: 'scale',
};

function originTag(origin: TranscriptEntry['origin']): string {
  if (origin === 'extrapolated') return '[EXTRAPOLATED]';
  if (origin === 'invented') return '[INVENTED]';
  return '[SEED]';
}

function fitLines(lines: string[], budget: number): string {
  if (lines.join('\n').length <= budget) return lines.join('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const marker = answersOmitted(lines.length - kept.length);
    if ([...kept, line, marker].join('\n').length > budget) break;
    kept.push(line);
  }
  return [...kept, answersOmitted(lines.length - kept.length)].join('\n');
}

function renderRoundBounded(
  s: InterviewSessionRow,
  roundNo: number,
  total: number,
  budget: number,
  includeSeed: boolean,
): string | null {
  const header = `## Project Meeting Round — ${s.created_at.slice(0, 10)} (round ${roundNo} of ${total})`;
  if (header.length > budget) return null;
  const pieces: string[] = [header];
  let used = header.length;

  const seedTitle = '### Seed (verbatim excerpt)';
  const seedOverhead = 2 + seedTitle.length + 1;
  const seedReserve = includeSeed
    ? Math.min(ROUND_SEED_MIN + seedOverhead, Math.max(0, budget - used))
    : 0;

  const confirmed = s.answers.filter((a) => a.disposition === 'field_mapped' || a.disposition === 'seed_color');
  const answerLines = confirmed.map(
    (a) => `- ${originTag(a.origin)} ${(a.question_text ?? a.question_id)}: ${a.answer_text.trim()}`,
  );
  if (answerLines.length) {
    const title = '### Confirmed answers';
    const answersBudget = budget - used - seedReserve - (2 + title.length + 1);
    if (answersBudget > answersOmitted(answerLines.length).length) {
      const body = fitLines(answerLines, answersBudget);
      pieces.push(`${title}\n${body}`);
      used += 2 + title.length + 1 + body.length;
    }
  }

  if (includeSeed) {
    const seedBudget = budget - used - seedOverhead;
    if (seedBudget > 0) {
      pieces.push(`${seedTitle}\n${excerpt(s.seed_text, seedBudget)}`);
    }
  }

  return pieces.join('\n\n');
}

export function projectConceptSeed(sessions: InterviewSessionRow[], cap = 4000): string {
  const banked = sessions
    .filter((s) => s.state === 'banked' || s.state === 'exported')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (banked.length === 0) return CONCEPT_SEED_SENTINEL;

  const total = banked.length;
  const founding = banked[0];
  const foundingHeader = `## Founding seed — ${founding.created_at.slice(0, 10)} (verbatim excerpt)`;
  const foundingBudget = Math.max(0, Math.min(FOUNDING_SEED_RESERVE, cap) - foundingHeader.length - 1);
  const parts: string[] = [`${foundingHeader}\n${excerpt(founding.seed_text, foundingBudget)}`];
  let remaining = cap - parts[0].length;
  let dropped = 0;

  for (let i = total - 1; i >= 0; i--) {
    const isNewest = i === total - 1;
    const sep = 2;
    const reserve = i > 0 ? roundsOmitted(i).length + sep : 0;
    const budget = remaining - sep - reserve;

    if (isNewest) {
      const rendered = renderRoundBounded(banked[i], i + 1, total, budget, i > 0);
      if (rendered === null) { dropped = total; break; }
      parts.push(rendered);
      remaining -= rendered.length + sep;
    } else {
      const full = renderRoundBounded(banked[i], i + 1, total, Number.MAX_SAFE_INTEGER, i > 0)!;
      if (full.length > budget) {
        dropped = i + 1;
        break;
      }
      parts.push(full);
      remaining -= full.length + sep;
    }
  }

  if (dropped > 0) parts.push(roundsOmitted(dropped));
  return parts.join('\n\n');
}
