import type { InterviewAuditContext } from './auditContext';
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

function verdict(ok: boolean, coveredFromPrior: boolean): AuditVerdict {
  if (ok) return 'SUFFICIENT';
  return coveredFromPrior ? 'SUFFICIENT_FROM_PRIOR' : 'THIN';
}

export function auditSeed(seedText: string, opts: { speculative: boolean; context?: InterviewAuditContext }): AuditResult {
  const text = seedText.trim();
  const prior = opts.context?.coveredAreas ?? new Set<string>();
  const verdicts: AuditVerdicts = {
    locks: verdict(LOCK_RE.test(text), prior.has('locks')),
    ending: verdict(ENDING_RE.test(text), prior.has('ending')),
    open_questions: verdict(OPEN_RE.test(text), prior.has('open_questions')),
    load_bearing_character: verdict(BACKSTORY_RE.test(text), prior.has('load_bearing_character')),
  };
  if (opts.speculative) verdicts.world_rules = verdict(WORLD_RE.test(text), prior.has('world_rules'));

  return {
    verdicts,
    reasons: {
      locks: verdicts.locks === 'SUFFICIENT' ? 'Seed states at least one hard constraint.' : verdicts.locks === 'SUFFICIENT_FROM_PRIOR' ? 'Active direction carries a hard constraint from an earlier round.' : 'No hard story constraint is explicit yet.',
      ending: verdicts.ending === 'SUFFICIENT' ? 'Seed states or explicitly cedes the ending.' : verdicts.ending === 'SUFFICIENT_FROM_PRIOR' ? 'Active direction carries the ending from an earlier round.' : 'Ending is not stated or explicitly ceded.',
      open_questions: verdicts.open_questions === 'SUFFICIENT' ? 'Seed delegates/openly marks what the room may invent.' : verdicts.open_questions === 'SUFFICIENT_FROM_PRIOR' ? 'Active direction carries open questions from an earlier round.' : 'No explicit delegation/open-question lane yet.',
      load_bearing_character: verdicts.load_bearing_character === 'SUFFICIENT' ? 'Seed includes load-bearing character/backstory signal.' : verdicts.load_bearing_character === 'SUFFICIENT_FROM_PRIOR' ? 'Active direction carries load-bearing character detail from an earlier round.' : 'Load-bearing character specifics are thin.',
      ...(opts.speculative
        ? { world_rules: verdicts.world_rules === 'SUFFICIENT' ? 'Speculative world rules are stated.' : verdicts.world_rules === 'SUFFICIENT_FROM_PRIOR' ? 'Active direction carries speculative world rules from an earlier round.' : 'Speculative world rules are thin.' }
        : {}),
    },
  };
}

export function formatAuditMessage(verdicts: AuditVerdicts): string {
  const lines = Object.entries(verdicts).map(([area, value]) => `- ${area}: ${value}`);
  return ['Morgan audit:', ...lines].join('\n');
}
