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

function resolveCanonicalFieldPath(rawTarget: string, proposal: InterviewProposalRow): string {
  // Composite writerOSTarget patterns are not literal field paths. Use the
  // proposal's own question_id/session metadata or a stable sentinel so the
  // value still surfaces correctly in the bank preview / export.
  if (!rawTarget || rawTarget.includes('{') || rawTarget.includes('[') || rawTarget.includes('|')) {
    return proposal.question_id ? `interview_answer.${proposal.question_id}` : 'interview_answer';
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
    const mutability = input.mutability[proposal.id] ?? (fieldPath === 'open_questions' || fieldPath.startsWith('interview_answer.') ? 'open' : 'locked');
    if (mutability === 'open' || fieldPath === 'open_questions' || fieldPath.startsWith('interview_answer.')) {
      openQuestions.push(value);
    } else if (mutability === 'leaning') {
      leanings.push(`${originTag(proposal.origin)} ${value} — challenge permitted`);
      datedAnswers.push(`${originTag(proposal.origin)} ${value}`);
    } else {
      locks.push(`${originTag(proposal.origin)} ${value}`);
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
