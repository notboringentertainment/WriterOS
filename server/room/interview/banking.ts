import type { ProposalOrigin } from '../types';
import { createHash } from 'node:crypto';
import { foldMeetingDecisions } from './meetingDecisions';
import { getQuestionById } from './questionBank';
import type { InterviewProposalRow, InterviewSessionRow, MeetingDecisionContent, MeetingDecisionRow, TranscriptEntry } from './types';

export type Mutability = 'locked' | 'leaning' | 'open';

export interface TaggableAnswer {
  proposalId: string;
  questionId: string | null;
  value: string;
  origin: ProposalOrigin | null;
  defaultMutability: Mutability;
  applied: Mutability;
}

export interface BankPreview {
  title: string;
  seedText: string;
  datedAnswers: string[];
  seedColor: string[];
  locks: string[];
  leanings: string[];
  openQuestions: string[];
  conceptSeedAppend: string;
  taggable: TaggableAnswer[];
}

export type MeetingRevisionInput =
  | { op: 'keep'; targetId: string }
  | { op: 'revise'; targetId: string; statement: string; mutability?: Mutability }
  | { op: 'retract'; targetId: string }
  | { op: 'supersede'; targetIds: string[]; area: string; fieldPath: string; statement: string; mutability: Mutability };

export interface DirectionDiffEntry {
  area: string;
  before: string[];
  after: string[];
  op: MeetingRevisionInput['op'] | 'assert';
}

export type PendingMeetingDecision = Omit<MeetingDecisionRow, 'project_id' | 'session_id'>;

export interface PendingMeetingDecisionPlan {
  pendingDecisions: PendingMeetingDecision[];
  directionDiff: DirectionDiffEntry[];
  activeDirection: MeetingDecisionRow[];
}

function originTag(origin: ProposalOrigin | null | undefined): string {
  return origin === 'extrapolated' ? '[EXTRAPOLATED]' : '[SEED]';
}

function effectiveValue(proposal: InterviewProposalRow): string {
  return (proposal.resolved_value ?? proposal.proposed_value).trim();
}

function originMarker(origin: ProposalOrigin | null): MeetingDecisionContent['originMarker'] {
  if (origin === 'extrapolated') return '[EXTRAPOLATED]';
  if (origin === 'invented') return '[INVENTED]';
  return '[SEED]';
}

function deterministicUuid(key: string): string {
  const chars = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function areaForProposal(proposal: InterviewProposalRow): string {
  return proposal.question_id
    ? getQuestionById(proposal.question_id)?.trigger ?? `question:${proposal.question_id}`
    : `question:${proposal.id}`;
}

function statementOf(row: MeetingDecisionRow): string {
  return 'statement' in row.content ? row.content.statement : '';
}

function contentTimestamp(session: InterviewSessionRow, existing: readonly MeetingDecisionRow[]): string {
  const latestExisting = existing.reduce<string | null>((value, row) => value === null || row.created_at > value ? row.created_at : value, null);
  if (latestExisting === null || session.updated_at > latestExisting) return session.updated_at;
  return new Date(new Date(latestExisting).getTime() + 1).toISOString();
}

export function buildPendingMeetingDecisions(input: {
  session: InterviewSessionRow;
  proposals: readonly InterviewProposalRow[];
  mutability: Record<string, Mutability>;
  existingDecisions: readonly MeetingDecisionRow[];
  operations: readonly MeetingRevisionInput[];
}): PendingMeetingDecisionPlan {
  const activeBefore = foldMeetingDecisions(input.existingDecisions).entries;
  const activeById = new Map(activeBefore.map((row) => [row.id, row]));
  const createdAt = contentTimestamp(input.session, input.existingDecisions);
  const pending: PendingMeetingDecision[] = [];
  const diff: DirectionDiffEntry[] = [];

  for (const proposal of input.proposals.filter((row) => row.status === 'adopted')) {
    const statement = effectiveValue(proposal);
    if (!statement) continue;
    const fieldPath = resolveCanonicalFieldPath(proposal.field_path, proposal);
    const defaultMutability: Mutability = fieldPath === 'open_questions' || fieldPath.startsWith('interview_answer.') ? 'open' : 'locked';
    const content: MeetingDecisionContent = {
      statement,
      mutability: input.mutability[proposal.id] ?? defaultMutability,
      originMarker: originMarker(proposal.origin),
      disposition: 'field_mapped',
    };
    const area = areaForProposal(proposal);
    pending.push({
      id: deterministicUuid(`${input.session.id}:assert:${proposal.id}`), area, field_path: fieldPath,
      op: 'assert', content, targets: [], created_at: createdAt,
    });
    diff.push({ area, before: [], after: [statement], op: 'assert' });
  }

  for (const answer of input.session.answers.filter((entry) => entry.disposition !== 'field_mapped')) {
    const area = getQuestionById(answer.question_id)?.trigger ?? `question:${answer.question_id}`;
    const statement = answer.disposition === 'skipped_delegated'
      ? `Delegated to the room: ${answer.question_text ?? answer.question_id}`
      : answer.answer_text.trim();
    if (!statement) continue;
    const content: MeetingDecisionContent = {
      statement,
      mutability: answer.disposition === 'skipped_delegated' ? 'open' : 'leaning',
      originMarker: originMarker(answer.origin),
      disposition: answer.disposition,
    };
    pending.push({
      id: deterministicUuid(`${input.session.id}:transcript:${answer.question_id}:${answer.at}`),
      area,
      field_path: `interview_answer.${answer.question_id}`,
      op: 'assert', content, targets: [], created_at: answer.at,
    });
    diff.push({ area, before: [], after: [statement], op: 'assert' });
  }

  for (const operation of input.operations) {
    const targetIds = operation.op === 'supersede' ? operation.targetIds : [operation.targetId];
    const targets = targetIds.map((id) => {
      const target = activeById.get(id);
      if (!target) throw new Error(`Meeting revision target ${id} is not active.`);
      return target;
    });
    const before = targets.map(statementOf);
    if (operation.op === 'keep') {
      diff.push({ area: targets[0].area, before, after: before, op: 'keep' });
      continue;
    }
    if (targetIds.some((id) => id.startsWith('legacy:'))) {
      throw new Error('Meeting revision requires the explicit legacy decision backfill before banking.');
    }
    if (operation.op === 'retract') {
      pending.push({ id: deterministicUuid(`${input.session.id}:retract:${targetIds.join(',')}`), area: targets[0].area, field_path: targets[0].field_path, op: 'retract', content: {}, targets: targetIds, created_at: createdAt });
      diff.push({ area: targets[0].area, before, after: [], op: 'retract' });
      continue;
    }
    const baseContent = targets[0].content as MeetingDecisionContent;
    const statement = operation.statement.trim();
    if (!statement) throw new Error(`${operation.op} requires replacement content.`);
    const area = operation.op === 'supersede' ? operation.area : targets[0].area;
    const fieldPath = operation.op === 'supersede' ? operation.fieldPath : targets[0].field_path;
    const content: MeetingDecisionContent = {
      statement,
      mutability: operation.mutability ?? baseContent.mutability,
      originMarker: '[SEED]',
      disposition: baseContent.disposition,
    };
    pending.push({ id: deterministicUuid(`${input.session.id}:${operation.op}:${targetIds.join(',')}:${statement}`), area, field_path: fieldPath, op: operation.op, content, targets: targetIds, created_at: createdAt });
    diff.push({ area, before, after: [statement], op: operation.op });
  }

  for (const redirect of input.session.cursor.redirects ?? []) {
    pending.push({
      id: deterministicUuid(`${input.session.id}:redirect:${redirect.area}:${redirect.question_id}:${redirect.at}`),
      area: redirect.area,
      field_path: `interview_answer.${redirect.question_id}`,
      op: 'redirect', content: {}, targets: [], created_at: redirect.at,
    });
  }

  const fullPending = pending.map((row) => ({ ...row, project_id: input.session.project_id, session_id: input.session.id }));
  const activeDirection = foldMeetingDecisions([...input.existingDecisions, ...fullPending]).entries;
  return { pendingDecisions: pending, directionDiff: diff, activeDirection };
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
  return preview.openQuestions.length ? preview.openQuestions.map((q) => `- ${q}`).join('\n') : 'Nothing delegated — writer holds all intent.';
}

export function parseOpenQuestionsBlock(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'Nothing delegated — writer holds all intent.' || trimmed === 'Nothing delegated — writer holds all intent') return [];
  const units: string[] = [];
  let current: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('- ')) {
      if (current.length) units.push(current.join('\n'));
      current = [line.slice(2)];
    } else if (current.length) current.push(line);
    else current = [line];
  }
  if (current.length) units.push(current.join('\n'));
  return units.filter((unit) => !/^… \(\+\d+ more — see Meeting record\)$/.test(unit));
}

export function renderOpenQuestionsBlockBounded(preview: BankPreview, cap = 2000): string {
  const full = renderOpenQuestionsBlock(preview);
  if (full.length <= cap) return full;
  const preamble: string[] = [];
  const units: string[][] = [];
  for (const line of full.split('\n')) {
    if (line.startsWith('- ')) units.push([line]);
    else if (units.length === 0) preamble.push(line);
    else units[units.length - 1].push(line);
  }
  const omitted = (n: number) => `- … (+${n} more — see Meeting record)`;
  const kept: string[][] = [];
  for (const unit of units) {
    const candidate = [...preamble, ...kept.flat(), ...unit, omitted(units.length - kept.length)].join('\n');
    if (candidate.length > cap) break;
    kept.push(unit);
  }
  return [...preamble, ...kept.flat(), omitted(units.length - kept.length)].join('\n');
}

export function renderBankedConceptSeed(preview: BankPreview): string {
  const parts = [
    `## Project Meeting Round — ${new Date().toISOString().slice(0, 10)}`,
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

export function resolveCanonicalFieldPath(rawTarget: string, proposal: InterviewProposalRow): string {
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
  const taggable: TaggableAnswer[] = [];

  for (const proposal of adopted) {
    const value = effectiveValue(proposal);
    if (!value) continue;
    const fieldPath = resolveCanonicalFieldPath(proposal.field_path, proposal);
    const defaultMutability = fieldPath === 'open_questions' || fieldPath.startsWith('interview_answer.') ? 'open' : 'locked';
    const mutability = input.mutability[proposal.id] ?? defaultMutability;
    taggable.push({
      proposalId: proposal.id,
      questionId: questionIdForFieldPath(proposal.field_path, proposal),
      value,
      origin: proposal.origin ?? null,
      defaultMutability,
      applied: mutability,
    });
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

  const delegatedLines = input.session.answers
    .filter((a) => a.disposition === 'skipped_delegated')
    .map((a) => `Delegated to the room: ${a.question_text ?? a.question_id}`);
  for (const line of delegatedLines) {
    if (!openQuestions.includes(line)) openQuestions.push(line);
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
    taggable,
  };
  preview.conceptSeedAppend = renderBankedConceptSeed(preview);
  return preview;
}
