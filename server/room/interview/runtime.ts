import * as roomStore from '../store';
import * as interviewStore from './store';
import { auditSeed, formatAuditMessage } from './audit';
import { buildBankPreview, type BankPreview, type Mutability, renderOpenQuestionsBlock, renderStoryLocksBlock } from './banking';
import { checkInterviewExport, renderPitchStudioSeedExport } from './exportCheck';
import { getQuestionById, selectQuestionsForAudit, type QuestionBankRow } from './questionBank';
import { advanceInterviewCursor, initialInterviewCursor, pauseInterviewSessionState, resumeInterviewSessionState } from './stateMachine';
import type { InterviewMode, InterviewSessionRow } from './types';
import type { ProposalOrigin } from '../types';

export interface InterviewStatus {
  activeSession: InterviewSessionRow | null;
  hasBankedSeed: boolean;
  actionLabel: 'First Meeting' | 'New interview round';
  currentQuestion: QuestionBankRow | null;
}

export interface InterviewStartResult {
  session: InterviewSessionRow;
  auditMessage: string;
  currentQuestion: QuestionBankRow | null;
}

export interface InterviewAnswerResult {
  session: InterviewSessionRow;
  proposal?: Awaited<ReturnType<typeof roomStore.insertProposal>>;
  currentQuestion: QuestionBankRow | null;
}

export interface InterviewBankResult {
  session: InterviewSessionRow;
  preview: BankPreview;
}

export interface InterviewExportResult {
  session: InterviewSessionRow;
  markdown: string;
}

function isPreBanked(state: InterviewSessionRow['state']): boolean {
  return state === 'intake' || state === 'auditing' || state === 'interviewing' || state === 'readback' || state === 'paused';
}

function hasBankedSeed(sessions: readonly InterviewSessionRow[]): boolean {
  return sessions.some((session) => session.state === 'banked' || session.state === 'exported');
}

function currentQuestionFor(session: InterviewSessionRow): QuestionBankRow | null {
  return session.cursor.question_id ? getQuestionById(session.cursor.question_id) ?? null : null;
}

function assertSessionProject(sessionProjectId: string, routeProjectId: string): void {
  if (sessionProjectId !== routeProjectId) {
    throw new Error(`Interview session does not belong to project ${routeProjectId}.`);
  }
}

const MAX_INTERVIEW_TEXT_LENGTH = 20000;

function validateTextLength(label: string, value: string | undefined): void {
  if (value === undefined) return;
  if (value.length > MAX_INTERVIEW_TEXT_LENGTH) {
    throw new Error(`${label} exceeds maximum length of ${MAX_INTERVIEW_TEXT_LENGTH} characters.`);
  }
}

function normalizeFieldPath(rawTarget: string, questionId: string): string {
  // Composite writerOSTarget patterns (e.g. storyBible.characters[x].{flaw,secret,want,need})
  // are not valid field paths. Fall back to a stable sentinel keyed by question so
  // banking/export can decide how to surface the value without corrupting field_path.
  if (rawTarget.includes('{') || rawTarget.includes('[') || rawTarget.includes('|')) {
    return `interview_answer.${questionId}`;
  }
  return rawTarget;
}

export async function getInterviewStatus(projectId: string): Promise<InterviewStatus> {
  const sessions = await interviewStore.listInterviewSessions(projectId);
  const activeSession = sessions.find((session) => isPreBanked(session.state)) ?? null;
  return {
    activeSession,
    hasBankedSeed: hasBankedSeed(sessions),
    actionLabel: hasBankedSeed(sessions) ? 'New interview round' : 'First Meeting',
    currentQuestion: activeSession ? currentQuestionFor(activeSession) : null,
  };
}

export async function startInterview(input: {
  projectId: string;
  mode: InterviewMode;
  seedText: string;
  speculative?: boolean;
}): Promise<InterviewStartResult> {
  const seedText = input.seedText.trim();
  if (!seedText) throw new Error('seedText is required.');
  validateTextLength('seedText', seedText);

  let session = await interviewStore.createInterviewSession({ projectId: input.projectId, mode: input.mode, seedText });
  const audit = auditSeed(seedText, { speculative: Boolean(input.speculative) });
  const questions = selectQuestionsForAudit({ audit: audit.verdicts, mode: input.mode, speculative: Boolean(input.speculative) });
  session = await interviewStore.updateInterviewSession(session.id, {
    state: questions.length ? 'interviewing' : 'readback',
    audit: audit.verdicts,
    cursor: initialInterviewCursor(questions),
  });

  await roomStore.insertMessage({ projectId: input.projectId, author: 'morgan', content: formatAuditMessage(audit.verdicts) });

  return { session, auditMessage: formatAuditMessage(audit.verdicts), currentQuestion: currentQuestionFor(session) };
}

export async function answerInterviewQuestion(input: {
  sessionId: string;
  projectId: string;
  answerText: string;
  disposition?: 'field_mapped' | 'seed_color' | 'skipped_delegated';
  resolvedValue?: string;
  origin?: ProposalOrigin;
  rejectMapping?: boolean;
}): Promise<InterviewAnswerResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state !== 'interviewing') throw new Error('Interview session is not accepting answers.');
  const question = currentQuestionFor(session);
  if (!question) throw new Error('Interview session has no active question.');

  const answerText = input.answerText.trim();
  if (!answerText) throw new Error('answerText is required.');
  validateTextLength('answerText', answerText);
  validateTextLength('resolvedValue', input.resolvedValue);
  const disposition = input.rejectMapping ? 'seed_color' : input.disposition ?? 'field_mapped';
  await interviewStore.appendInterviewAnswer(session.id, {
    question_id: question.id,
    lane: question.lane,
    answer_text: answerText,
    origin: disposition === 'skipped_delegated' ? null : input.origin ?? 'seed',
    disposition,
  });

  let proposal: InterviewAnswerResult['proposal'];
  if (disposition === 'field_mapped') {
    proposal = await roomStore.insertProposal({
      projectId: session.project_id,
      agentId: question.lane,
      surface: question.writerOSTarget.startsWith('storyBible') ? 'storyBible' : 'memory',
      fieldPath: normalizeFieldPath(question.writerOSTarget, question.id),
      proposedValue: input.resolvedValue ?? answerText,
      rationale: `First Meeting answer to ${question.id}`,
      kind: 'interview_answer',
      sessionId: session.id,
      questionId: question.id,
      origin: input.origin ?? 'seed',
    });
  }

  const questions = selectQuestionsForAudit({ audit: session.audit, mode: session.mode, speculative: session.audit.world_rules !== undefined });
  const nextPatch = advanceInterviewCursor(session, questions);
  const nextSession = await interviewStore.updateInterviewSession(session.id, nextPatch);
  return { session: nextSession, proposal, currentQuestion: currentQuestionFor(nextSession) };
}

export async function skipInterviewQuestion(input: { sessionId: string; projectId: string }): Promise<InterviewAnswerResult> {
  return answerInterviewQuestion({ ...input, answerText: 'Writer skipped/delegated this area to the room.', disposition: 'skipped_delegated' });
}

export async function wrapInterview(input: { sessionId: string; projectId: string }): Promise<InterviewSessionRow> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state === 'banked' || session.state === 'exported') {
    throw new Error(`Cannot wrap interview session that is already ${session.state}.`);
  }
  return interviewStore.updateInterviewSession(session.id, { state: 'readback', cursor: { lane: null, question_id: null, budgets_spent: session.cursor.budgets_spent } });
}

export async function pauseInterview(input: { sessionId: string; projectId: string }): Promise<InterviewSessionRow> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  return interviewStore.updateInterviewSession(session.id, pauseInterviewSessionState(session));
}

export async function resumeInterview(input: { sessionId: string; projectId: string }): Promise<InterviewSessionRow> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  return interviewStore.updateInterviewSession(session.id, resumeInterviewSessionState(session));
}

export async function previewBank(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<BankPreview> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  const proposals = await interviewStore.listInterviewProposals(session.id, 'adopted');
  return buildBankPreview({ session, proposals, mutability: input.mutability ?? {} });
}

export async function bankInterview(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<InterviewBankResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state !== 'readback') throw new Error('Only readback sessions can be banked.');
  const preview = await previewBank(input);
  const existingConceptSeed = await roomStore.getSharedBlockValue(session.project_id, 'concept_seed');
  const conceptSeedValue = [existingConceptSeed.trim(), preview.conceptSeedAppend].filter(Boolean).join('\n\n');

  for (const write of [
    roomStore.writeBlock({ projectId: session.project_id, agentId: null, label: 'concept_seed', value: conceptSeedValue, updatedBy: 'writer', charCap: 4000 }),
    roomStore.writeBlock({ projectId: session.project_id, agentId: null, label: 'story_locks', value: renderStoryLocksBlock(preview), updatedBy: 'writer', charCap: 2000 }),
    roomStore.writeBlock({ projectId: session.project_id, agentId: null, label: 'open_questions', value: renderOpenQuestionsBlock(preview), updatedBy: 'writer', charCap: 2000 }),
  ]) {
    const result = await write;
    if (!result.ok) throw new Error(result.reason);
  }

  const updated = await interviewStore.updateInterviewSession(session.id, { state: 'banked' });
  return { session: updated, preview };
}

export async function exportInterview(input: { sessionId: string; projectId: string; date?: string }): Promise<InterviewExportResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state !== 'banked' && session.state !== 'exported') throw new Error('Only banked sessions can be exported.');
  const preview = await previewBank(input);
  const markdown = renderPitchStudioSeedExport(preview, { date: input.date });
  const check = checkInterviewExport(markdown);
  if (!check.ok) throw new Error(`Export shape invalid: ${check.errors.join('; ')}`);
  const updated = session.state === 'exported' ? session : await interviewStore.updateInterviewSession(session.id, { state: 'exported' });
  return { session: updated, markdown };
}
