import * as roomStore from '../store';
import { mergeMeetingLocks } from '../lockSections';
import { getRoomDb } from '../supabaseClient';
import * as interviewStore from './store';
import { auditSeed, formatAuditMessage } from './audit';
import { buildBankPreview, type BankPreview, type Mutability, parseOpenQuestionsBlock, renderOpenQuestionsBlockBounded } from './banking';
import { checkInterviewExport, renderPitchStudioSeedExport } from './exportCheck';
import { DOMAIN_BY_TRIGGER, projectConceptSeed } from './conceptSeedProjection';
import { getQuestionById, selectQuestionsForAudit, type QuestionBankRow } from './questionBank';
import { advanceInterviewCursor, initialInterviewCursor, pauseInterviewSessionState, resumeInterviewSessionState } from './stateMachine';
import type { InterviewMode, InterviewSessionRow, MeetingBankSnapshot } from './types';
import type { ProposalOrigin } from '../types';

export interface InterviewStatus {
  activeSession: InterviewSessionRow | null;
  hasBankedSeed: boolean;
  actionLabel: 'Project Meeting' | 'New interview round';
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
    actionLabel: hasBankedSeed(sessions) ? 'New interview round' : 'Project Meeting',
    currentQuestion: activeSession ? currentQuestionFor(activeSession) : null,
  };
}

export async function startInterview(input: {
  projectId: string;
  mode: InterviewMode;
  seedText: string;
  speculative?: boolean;
}): Promise<InterviewStartResult> {
  const seedText = input.seedText;
  if (!seedText.trim()) throw new Error('seedText is required.');
  validateTextLength('seedText', seedText);

  // One active Project Meeting per project (§A4 assumes a single live session).
  // This check is advisory; the unique partial index on interview_sessions is the
  // authoritative guard — a race that slips past the check loses at insert time.
  const existingSessions = await interviewStore.listInterviewSessions(input.projectId);
  if (existingSessions.some((existing) => isPreBanked(existing.state))) {
    throw new Error(`A Project Meeting is already in progress for project ${input.projectId}.`);
  }

  let session: InterviewSessionRow;
  try {
    session = await interviewStore.createInterviewSession({ projectId: input.projectId, mode: input.mode, seedText });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('interview_sessions_one_active_per_project')) {
      throw new Error(`A Project Meeting is already in progress for project ${input.projectId}.`);
    }
    throw error;
  }
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

  const answerText = input.answerText;
  if (!answerText.trim()) throw new Error('answerText is required.');
  validateTextLength('answerText', answerText);
  validateTextLength('resolvedValue', input.resolvedValue);
  const disposition = input.rejectMapping ? 'seed_color' : input.disposition ?? 'field_mapped';
  await interviewStore.appendInterviewAnswer(session.id, {
    question_id: question.id,
    question_text: question.question,
    domain: DOMAIN_BY_TRIGGER[question.trigger],
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
      rationale: `Project Meeting answer to ${question.id}`,
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

function cumulativeOpenQuestions(
  sessionsAsBanked: InterviewSessionRow[],
  currentSessionId: string,
  currentSnapshot: MeetingBankSnapshot,
): string[] {
  const terminal = sessionsAsBanked.filter((s) => s.state === 'banked' || s.state === 'exported');
  const priorLines = terminal
    .filter((s) => s.id !== currentSessionId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((s) => s.bank_snapshot?.open_questions ?? s.answers
      .filter((a) => a.disposition === 'skipped_delegated')
      .map((a) => `Delegated to the room: ${a.question_text ?? a.question_id}`));
  const legacyLines = terminal.flatMap((s) => s.bank_snapshot?.legacy_open_questions ?? []);
  const seen = new Set<string>();
  return [...currentSnapshot.open_questions, ...priorLines, ...legacyLines]
    .filter((line) => (seen.has(line) ? false : (seen.add(line), true)));
}

async function computeBankValues(session: InterviewSessionRow, preview: BankPreview): Promise<{
  concept_seed: string;
  story_locks: string;
  open_questions: string;
  currentLocks: string;
  bankRevision: number;
  bank_snapshot: MeetingBankSnapshot;
}> {
  const conceptSeedSnapshot = await roomStore.getSharedBlockSnapshot(session.project_id, 'concept_seed');
  if (conceptSeedSnapshot === null) throw new Error('contracted concept_seed block missing — room memory not initialized.');
  const allSessions = await interviewStore.listInterviewSessions(session.project_id);
  const [currentLocks, currentOpenQuestions] = await Promise.all([
    roomStore.getSharedBlockValue(session.project_id, 'story_locks'),
    roomStore.getSharedBlockValue(session.project_id, 'open_questions'),
  ]);
  if (currentLocks === null || currentOpenQuestions === null) {
    throw new Error('contracted memory block missing — room memory not initialized.');
  }
  const hasCanonicalSnapshot = allSessions.some(
    (s) => (s.state === 'banked' || s.state === 'exported') && s.bank_snapshot !== null,
  );
  const bankSnapshot: MeetingBankSnapshot = {
    applied_classifications: Object.fromEntries(preview.taggable.map((item) => [item.proposalId, item.applied])),
    open_questions: [...preview.openQuestions],
    legacy_open_questions: hasCanonicalSnapshot ? [] : parseOpenQuestionsBlock(currentOpenQuestions),
  };
  const sessionsAsBanked = allSessions.map((s) => s.id === session.id
    ? { ...s, state: 'banked' as const, bank_snapshot: bankSnapshot }
    : s);
  const projectedOpenQuestions = cumulativeOpenQuestions(sessionsAsBanked, session.id, bankSnapshot);
  return {
    concept_seed: projectConceptSeed(sessionsAsBanked),
    story_locks: mergeMeetingLocks(currentLocks, preview.locks),
    open_questions: renderOpenQuestionsBlockBounded({ ...preview, openQuestions: projectedOpenQuestions }, 2000),
    currentLocks,
    bankRevision: conceptSeedSnapshot.revision,
    bank_snapshot: bankSnapshot,
  };
}

export async function previewBankFinal(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<{
  preview: BankPreview;
  finalValues: { concept_seed: string; story_locks: string; open_questions: string };
}> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  const preview = await previewBank(input);
  const { concept_seed, story_locks, open_questions } = await computeBankValues(session, preview);
  return { preview, finalValues: { concept_seed, story_locks, open_questions } };
}

export async function bankInterview(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability> }): Promise<InterviewBankResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state === 'banked' || session.state === 'exported') {
    const preview = await previewBank({ ...input, mutability: session.bank_snapshot?.applied_classifications ?? input.mutability ?? {} });
    return { session, preview };
  }
  if (session.state !== 'readback') throw new Error('Only readback sessions can be banked.');
  const preview = await previewBank(input);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const values = await computeBankValues(session, preview);
    if (values.story_locks.length > 2000) {
      throw new Error('Story locks block exceeds maximum length (2000 chars after merging Meeting locks). Consolidate locks at readback before banking.');
    }
    const rpc = await getRoomDb().rpc('bank_meeting_memory', {
      p_project_id: session.project_id,
      p_session_id: session.id,
      p_bank_revision: values.bankRevision,
      p_concept_seed: values.concept_seed,
      p_locks_expected: values.currentLocks,
      p_locks_next: values.story_locks,
      p_open_questions: values.open_questions,
      p_bank_snapshot: values.bank_snapshot,
    });
    if (!rpc.error) {
      const refreshed = await interviewStore.getInterviewSession(session.id);
      if (!refreshed) throw new Error('Bank completed but the canonical session could not be reloaded.');
      if (rpc.data === 'already_banked') {
        const storedPreview = await previewBank({ ...input, mutability: refreshed.bank_snapshot?.applied_classifications ?? {} });
        return { session: refreshed, preview: storedPreview };
      }
      return { session: refreshed, preview };
    }
    if (!rpc.error.message.includes('locks_conflict') && !rpc.error.message.includes('projection_conflict')) {
      throw new Error(`Bank failed: ${rpc.error.message}`);
    }
  }
  throw new Error('Bank failed: shared-memory contention persisted across 3 attempts.');
}

export async function exportInterview(input: { sessionId: string; projectId: string; date?: string }): Promise<InterviewExportResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state !== 'banked' && session.state !== 'exported') throw new Error('Only banked sessions can be exported.');
  const preview = await previewBank({ ...input, mutability: session.bank_snapshot?.applied_classifications ?? {} });
  const markdown = renderPitchStudioSeedExport(preview, { date: input.date });
  const check = checkInterviewExport(markdown);
  if (!check.ok) throw new Error(`Export shape invalid: ${check.errors.join('; ')}`);
  const updated = session.state === 'exported' ? session : await interviewStore.updateInterviewSession(session.id, { state: 'exported' });
  return { session: updated, markdown };
}
