import type { AuditVerdicts, AuditVerdict } from './types';

export interface AuditResult {
  verdicts: AuditVerdicts;
  reasons: Record<string, string>;
}

const LOCK_RE = /\b(lock|must never|not allowed|cannot become|do not violate)\b/i;
const OPEN_RE = /\b(open questions?|ours to invent|room may invent|surprise me|delegat(?:e|ed)|explicitly open|ours\?)\b/i;
const BACKSTORY_RE = /\b(backstory|before page one|broke|wound|secret|want|need|flaw|relationship|sister|brother|mother|father|friend|lover)\b/i;
const ENDING_RE = /\b(ending|ends with|it ends|finale|resolution|explicitly ceded|ending is ours)\b/i;
const WORLD_RE = /\b(world rules?|magic|mythology|speculative|refuse to allow|doesn't allow|world refuses|technology|supernatural)\b/i;

function verdict(ok: boolean): AuditVerdict {
  return ok ? 'SUFFICIENT' : 'THIN';
}

export function auditSeed(seedText: string, opts: { speculative: boolean }): AuditResult {
  const text = seedText.trim();
  const verdicts: AuditVerdicts = {
    locks: verdict(LOCK_RE.test(text)),
    ending: verdict(ENDING_RE.test(text)),
    open_questions: verdict(OPEN_RE.test(text)),
    load_bearing_character: verdict(BACKSTORY_RE.test(text)),
  };
  if (opts.speculative) verdicts.world_rules = verdict(WORLD_RE.test(text));

  return {
    verdicts,
    reasons: {
      locks: verdicts.locks === 'SUFFICIENT' ? 'Seed states at least one hard constraint.' : 'No hard story constraint is explicit yet.',
      ending: verdicts.ending === 'SUFFICIENT' ? 'Seed states or explicitly cedes the ending.' : 'Ending is not stated or explicitly ceded.',
      open_questions: verdicts.open_questions === 'SUFFICIENT' ? 'Seed delegates/openly marks what the room may invent.' : 'No explicit delegation/open-question lane yet.',
      load_bearing_character: verdicts.load_bearing_character === 'SUFFICIENT' ? 'Seed includes load-bearing character/backstory signal.' : 'Load-bearing character specifics are thin.',
      ...(opts.speculative
        ? { world_rules: verdicts.world_rules === 'SUFFICIENT' ? 'Speculative world rules are stated.' : 'Speculative world rules are thin.' }
        : {}),
    },
  };
}

export function formatAuditMessage(verdicts: AuditVerdicts): string {
  const lines = Object.entries(verdicts).map(([area, value]) => `- ${area}: ${value}`);
  return ['Morgan audit:', ...lines].join('\n');
}
