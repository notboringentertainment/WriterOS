import type { ProposalOrigin } from '../types';
import type { InterviewProposalRow, InterviewSessionRow, TranscriptEntry } from './types';

export type Mutability = 'locked' | 'leaning' | 'open';

export interface BankPreview {
  title: string;
  seedText: string;
  datedAnswers: string[];
  seedColor: string[];
  locks: string[];
  leanings: string[];
  openQuestions: string[];
  conceptSeedAppend: string;
}

function originTag(origin: ProposalOrigin | null | undefined): string {
  return origin === 'extrapolated' ? '[EXTRAPOLATED]' : '[SEED]';
}

function effectiveValue(proposal: InterviewProposalRow): string {
  return (proposal.resolved_value ?? proposal.proposed_value).trim();
}

function datedAnswer(entry: TranscriptEntry): string {
  const day = entry.at.slice(0, 10);
  if (entry.disposition === 'skipped_delegated') {
    return `Interview answer, ${day}: ${entry.answer_text.trim()}`;
  }
  const tag = originTag(entry.origin);
  return `${tag} Interview answer, ${day}: ${entry.answer_text.trim()}`;
}

const BANK_FIELD_BY_INTERVIEW_QUESTION: Record<string, string> = {
  'morgan-ending': 'story_locks',
};

export function renderStoryLocksBlock(preview: BankPreview): string {
  return preview.locks.length ? preview.locks.join('\n') : 'No locks — writer cedes broadly';
}

export function renderOpenQuestionsBlock(preview: BankPreview): string {
  return preview.openQuestions.length ? preview.openQuestions.map((q) => `- ${q}`).join('\n') : 'Nothing delegated — writer holds all intent';
}

export function renderBankedConceptSeed(preview: BankPreview): string {
  const parts = [
    `## First Meeting Round — ${new Date().toISOString().slice(0, 10)}`,
    '',
    '### Verbatim seed',
    preview.seedText.trim(),
    '',
    preview.datedAnswers.length ? ['### Confirmed interview answers', ...preview.datedAnswers.map((answer) => `- ${answer}`)].join('\n') : '',
    preview.seedColor.length ? ['### Seed color', ...preview.seedColor.map((answer) => `- ${answer}`)].join('\n') : '',
    preview.leanings.length ? ['### Leanings', ...preview.leanings.map((item) => `- ${item}`)].join('\n') : '',
    '### Locks',
    renderStoryLocksBlock(preview),
    '',
    '### Open questions',
    renderOpenQuestionsBlock(preview),
  ];
  return parts.filter((part) => part !== '').join('\n').trim();
}

function questionIdForFieldPath(rawTarget: string, proposal: InterviewProposalRow): string | null {
  if (proposal.question_id) return proposal.question_id;
  return rawTarget.startsWith('interview_answer.') ? rawTarget.slice('interview_answer.'.length) : null;
}

function resolveCanonicalFieldPath(rawTarget: string, proposal: InterviewProposalRow): string {
  const questionId = questionIdForFieldPath(rawTarget, proposal);
  if (questionId && BANK_FIELD_BY_INTERVIEW_QUESTION[questionId]) {
    return BANK_FIELD_BY_INTERVIEW_QUESTION[questionId];
  }

  // Composite writerOSTarget patterns are not literal field paths. Use the
  // proposal's own question_id/session metadata or a stable sentinel so the
  // value still surfaces correctly in the bank preview / export.
  if (!rawTarget || rawTarget.includes('{') || rawTarget.includes('[') || rawTarget.includes('|')) {
    return questionId ? `interview_answer.${questionId}` : 'interview_answer';
  }
  return rawTarget;
}

export function buildBankPreview(input: {
  session: InterviewSessionRow;
  proposals: readonly InterviewProposalRow[];
  mutability: Record<string, Mutability>;
  title?: string;
}): BankPreview {
  const adopted = input.proposals.filter((proposal) => proposal.status === 'adopted');
  const locks: string[] = [];
  const leanings: string[] = [];
  const openQuestions: string[] = [];
  const datedAnswers: string[] = [];

  for (const proposal of adopted) {
    const value = effectiveValue(proposal);
    if (!value) continue;
    const fieldPath = resolveCanonicalFieldPath(proposal.field_path, proposal);
    const defaultMutability = fieldPath === 'open_questions' || fieldPath.startsWith('interview_answer.') ? 'open' : 'locked';
    const mutability = input.mutability[proposal.id] ?? defaultMutability;
    if (mutability === 'locked') {
      locks.push(`${originTag(proposal.origin)} ${value}`);
    } else if (mutability === 'leaning') {
      leanings.push(`${originTag(proposal.origin)} ${value} — challenge permitted`);
    } else {
      openQuestions.push(value);
    }
    if (mutability !== 'open') {
      datedAnswers.push(`${originTag(proposal.origin)} ${value}`);
    }
  }

  const seedColor = input.session.answers
    .filter((entry) => entry.disposition === 'seed_color' || entry.disposition === 'skipped_delegated')
    .map(datedAnswer);

  const preview: BankPreview = {
    title: input.title ?? 'Untitled Project',
    seedText: input.session.seed_text,
    datedAnswers,
    seedColor,
    locks,
    leanings,
    openQuestions,
    conceptSeedAppend: '',
  };
  preview.conceptSeedAppend = renderBankedConceptSeed(preview);
  return preview;
}
