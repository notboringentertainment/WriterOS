import * as roomStore from '../store';
import { renderMeetingLocksFromDirection } from '../lockSections';
import { getRoomDb } from '../supabaseClient';
import * as interviewStore from './store';
import * as auditContextRuntime from './auditContext';
import { auditSeed, formatAuditMessage } from './audit';
import { buildBankPreview, buildPendingMeetingDecisions, type BankPreview, type DirectionDiffEntry, type MeetingRevisionInput, type Mutability, type PendingMeetingDecision, parseOpenQuestionsBlock, renderOpenQuestionsBlockBounded } from './banking';
import { checkInterviewExport, renderPitchStudioSeedExport } from './exportCheck';
import { DOMAIN_BY_TRIGGER, projectConceptSeedWithDirection } from './conceptSeedProjection';
import { emitMeetingTrace } from './trace';
import { getQuestionById, QUESTION_BANK, selectQuestionsForAudit, type QuestionBankRow } from './questionBank';
import { advanceInterviewCursor, initialInterviewCursor, pauseInterviewSessionState, resumeInterviewSessionState } from './stateMachine';
import type { InterviewCursor, InterviewMode, InterviewSessionRow, MeetingBankSnapshot, MeetingRecapItem } from './types';
import type { ProposalOrigin } from '../types';

export interface InterviewStatus {
  activeSession: InterviewSessionRow | null;
  latestTerminalSession: InterviewSessionRow | null;
  hasBankedSeed: boolean;
  actionLabel: 'Project Meeting' | 'New interview round';
  currentQuestion: QuestionBankRow | null;
  recap: MeetingRecapItem[];
  directionDiff: DirectionDiffEntry[];
  directionRevision: number;
}

export interface InterviewStartResult {
  session: InterviewSessionRow;
  auditMessage: string;
  currentQuestion: QuestionBankRow | null;
  recap: MeetingRecapItem[];
  directionDiff: DirectionDiffEntry[];
  directionRevision: number;
}

export interface InterviewAnswerResult {
  session: InterviewSessionRow;
  proposal?: Awaited<ReturnType<typeof roomStore.insertProposal>>;
  currentQuestion: QuestionBankRow | null;
}

export interface InterviewBankResult {
  session: InterviewSessionRow;
  preview: BankPreview;
  directionDiff?: DirectionDiffEntry[];
  directionRevision?: number;
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

function terminalSessions(sessions: readonly InterviewSessionRow[]): InterviewSessionRow[] {
  return sessions
    .filter((session) => session.state === 'banked' || session.state === 'exported')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function questionIdForArea(area: string): string | null {
  if (area.startsWith('question:')) return area.slice('question:'.length);
  return QUESTION_BANK.find((question) => question.trigger === area && question.requirement !== 'optional')?.id ?? null;
}

export function buildMeetingRecap(
  context: auditContextRuntime.InterviewAuditContext,
  sessions: readonly InterviewSessionRow[],
): MeetingRecapItem[] {
  const rounds = new Map(terminalSessions(sessions).map((session, index) => [session.id, index + 1]));
  return context.activeDecisions.flatMap((decision) => {
    const statement = 'statement' in decision.content ? decision.content.statement : '';
    if (!statement) return [];
    return [{
      decisionId: decision.id,
      sessionId: decision.session_id,
      area: decision.area,
      fieldPath: decision.field_path,
      statement,
      roundNumber: rounds.get(decision.session_id) ?? 1,
      questionId: questionIdForArea(decision.area),
    }];
  });
}

async function loadAuditContext(
  projectId: string,
  sessions: readonly InterviewSessionRow[],
): Promise<auditContextRuntime.InterviewAuditContext> {
  const [storyLocks, openQuestions] = await Promise.all([
    roomStore.getSharedBlockValue(projectId, 'story_locks'),
    roomStore.getSharedBlockValue(projectId, 'open_questions'),
  ]);
  return auditContextRuntime.buildAuditContext({
    projectId,
    sessions,
    storyLocks: storyLocks ?? '',
    openQuestions: openQuestions ?? '',
  });
}

function currentQuestionFor(session: InterviewSessionRow): QuestionBankRow | null {
  return session.cursor.question_id ? getQuestionById(session.cursor.question_id) ?? null : null;
}

export function reconstructInterviewQuestions(session: InterviewSessionRow): QuestionBankRow[] {
  const base = selectQuestionsForAudit({
    audit: session.audit,
    mode: session.mode,
    speculative: session.audit.world_rules !== undefined,
  });
  const selected = [...base];
  const selectedIds = new Set(selected.map((question) => question.id));
  for (const redirect of session.cursor.redirects ?? []) {
    if (redirect.answered_at !== null || selectedIds.has(redirect.question_id)) continue;
    const question = getQuestionById(redirect.question_id);
    if (!question) continue;
    selected.push(question);
    selectedIds.add(question.id);
  }
  return selected;
}

function stampAnsweredRedirect(cursor: InterviewCursor, questionId: string, answeredAt: string): InterviewCursor {
  return {
    ...cursor,
    redirects: (cursor.redirects ?? []).map((redirect) => (
      redirect.question_id === questionId && redirect.answered_at === null
        ? { ...redirect, answered_at: answeredAt }
        : redirect
    )),
  };
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
  const latestTerminalSession = sessions.find((session) => session.state === 'banked' || session.state === 'exported') ?? null;
  const bankedSeedExists = hasBankedSeed(sessions);
  const [context, directionSnapshot] = await Promise.all([
    activeSession && bankedSeedExists ? loadAuditContext(projectId, sessions) : Promise.resolve(null),
    bankedSeedExists ? roomStore.getSharedBlockSnapshot(projectId, 'concept_seed') : Promise.resolve(null),
  ]);
  return {
    activeSession,
    latestTerminalSession,
    hasBankedSeed: bankedSeedExists,
    actionLabel: bankedSeedExists ? 'New interview round' : 'Project Meeting',
    currentQuestion: activeSession ? currentQuestionFor(activeSession) : null,
    recap: context ? buildMeetingRecap(context, sessions) : [],
    directionDiff: [],
    directionRevision: directionSnapshot?.revision ?? 0,
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
  const hasPriorDirection = hasBankedSeed(existingSessions);
  const [context, directionSnapshot] = hasPriorDirection
    ? await Promise.all([loadAuditContext(input.projectId, existingSessions), roomStore.getSharedBlockSnapshot(input.projectId, 'concept_seed')])
    : [undefined, null];
  const recap = context ? buildMeetingRecap(context, existingSessions) : [];

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
  const audit = auditSeed(seedText, { speculative: Boolean(input.speculative), context });
  const questions = selectQuestionsForAudit({ audit: audit.verdicts, mode: input.mode, speculative: Boolean(input.speculative) });
  session = await interviewStore.updateInterviewSession(session.id, {
    state: questions.length ? 'interviewing' : 'readback',
    audit: audit.verdicts,
    cursor: initialInterviewCursor(questions),
  });

  await roomStore.insertMessage({ projectId: input.projectId, author: 'morgan', content: formatAuditMessage(audit.verdicts) });

  return { session, auditMessage: formatAuditMessage(audit.verdicts), currentQuestion: currentQuestionFor(session), recap, directionDiff: [], directionRevision: directionSnapshot?.revision ?? 0 };
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
  const transcriptEntry = {
    question_id: question.id,
    question_text: question.question,
    domain: DOMAIN_BY_TRIGGER[question.trigger],
    lane: question.lane,
    answer_text: answerText,
    origin: disposition === 'skipped_delegated' ? null : input.origin ?? 'seed',
    disposition,
  } as const;

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

  const questions = reconstructInterviewQuestions(session);
  const answeredAt = new Date().toISOString();
  const sessionWithStampedRedirect = {
    ...session,
    cursor: stampAnsweredRedirect(session.cursor, question.id, answeredAt),
  };
  const nextPatch = advanceInterviewCursor(sessionWithStampedRedirect, questions);
  const nextSession = await interviewStore.appendInterviewAnswerAndUpdateCursor(
    session.id,
    { ...transcriptEntry, at: answeredAt },
    nextPatch,
  );
  return { session: nextSession, proposal, currentQuestion: currentQuestionFor(nextSession) };
}

export async function redirectInterviewArea(input: {
  sessionId: string;
  projectId: string;
  area: string;
  questionId: string;
}): Promise<InterviewAnswerResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (!isPreBanked(session.state)) throw new Error('Only active pre-banked interview sessions can redirect an area.');

  const question = getQuestionById(input.questionId);
  if (!question || (question.trigger !== input.area && `question:${question.id}` !== input.area)) {
    throw new Error('Redirect area does not match the requested question.');
  }
  if ((session.cursor.redirects ?? []).some((redirect) => redirect.area === input.area && redirect.answered_at === null)) {
    return { session, currentQuestion: currentQuestionFor(session) };
  }

  const redirects = [...(session.cursor.redirects ?? []), {
    area: input.area,
    question_id: question.id,
    at: new Date().toISOString(),
    answered_at: null,
  }];
  const hasCurrentQuestion = session.cursor.question_id !== null;
  const updated = await interviewStore.updateInterviewSession(session.id, {
    state: hasCurrentQuestion ? session.state : 'interviewing',
    cursor: {
      ...session.cursor,
      lane: hasCurrentQuestion ? session.cursor.lane : question.lane,
      question_id: hasCurrentQuestion ? session.cursor.question_id : question.id,
      redirects,
    },
  });
  return { session: updated, currentQuestion: currentQuestionFor(updated) };
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
  return interviewStore.updateInterviewSession(session.id, { state: 'readback', cursor: { lane: null, question_id: null, budgets_spent: session.cursor.budgets_spent, redirects: session.cursor.redirects ?? [] } });
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

export interface MeetingBankPlan {
  preview: BankPreview;
  directionDiff: DirectionDiffEntry[];
  directionRevision: number;
  pendingDecisions: PendingMeetingDecision[];
  finalValues: { concept_seed: string; story_locks: string; open_questions: string };
  bankSnapshot: MeetingBankSnapshot;
  locksExpected: string;
  bankRevision: number;
}

export async function computeBankPlan(input: {
  session: InterviewSessionRow;
  mutability?: Record<string, Mutability>;
  operations?: readonly MeetingRevisionInput[];
}): Promise<MeetingBankPlan> {
  const session = input.session;
  const conceptSeedSnapshot = await roomStore.getSharedBlockSnapshot(session.project_id, 'concept_seed');
  if (conceptSeedSnapshot === null) throw new Error('contracted concept_seed block missing — room memory not initialized.');
  const [allSessions, proposals, currentLocks, currentOpenQuestions] = await Promise.all([
    interviewStore.listInterviewSessions(session.project_id),
    interviewStore.listInterviewProposals(session.id, 'adopted'),
    roomStore.getSharedBlockValue(session.project_id, 'story_locks'),
    roomStore.getSharedBlockValue(session.project_id, 'open_questions'),
  ]);
  if (currentLocks === null || currentOpenQuestions === null) {
    throw new Error('contracted memory block missing — room memory not initialized.');
  }
  const existingDecisions = (await auditContextRuntime.buildAuditContext({
    projectId: session.project_id,
    sessions: allSessions,
    storyLocks: currentLocks,
    openQuestions: currentOpenQuestions,
  })).activeDecisions;
  const preview = buildBankPreview({ session, proposals, mutability: input.mutability ?? {} });
  const direction = buildPendingMeetingDecisions({
    session,
    proposals,
    mutability: input.mutability ?? {},
    existingDecisions,
    operations: input.operations ?? [],
  });
  emitMeetingTrace({ type: 'meeting.direction.folded', projectId: session.project_id, sessionId: session.id, activeCount: direction.activeDirection.length, pendingCount: direction.pendingDecisions.length });
  const bankSnapshot: MeetingBankSnapshot = {
    applied_classifications: Object.fromEntries(preview.taggable.map((item) => [item.proposalId, item.applied])),
    open_questions: [...preview.openQuestions],
    legacy_open_questions: existingDecisions.length > 0 ? [] : parseOpenQuestionsBlock(currentOpenQuestions),
  };
  const sessionsAsBanked = allSessions.map((s) => s.id === session.id
    ? { ...s, state: 'banked' as const, bank_snapshot: bankSnapshot }
    : s);
  const delegated = session.answers
    .filter((answer) => answer.disposition === 'skipped_delegated')
    .map((answer) => `Delegated to the room: ${answer.question_text ?? answer.question_id}`);
  const projectedOpenQuestions = direction.activeDirection.flatMap((row) =>
    'statement' in row.content && row.content.mutability === 'open' ? [row.content.statement] : []);
  const seen = new Set<string>();
  const openQuestions = [...projectedOpenQuestions, ...delegated, ...bankSnapshot.legacy_open_questions]
    .filter((line) => seen.has(line) ? false : (seen.add(line), true));
  const finalValues = {
    concept_seed: projectConceptSeedWithDirection(sessionsAsBanked, direction.activeDirection),
    story_locks: renderMeetingLocksFromDirection(currentLocks, direction.activeDirection),
    open_questions: renderOpenQuestionsBlockBounded({ ...preview, openQuestions }, 2000),
  };
  return {
    preview,
    directionDiff: direction.directionDiff,
    directionRevision: conceptSeedSnapshot.revision,
    pendingDecisions: direction.pendingDecisions,
    finalValues,
    locksExpected: currentLocks,
    bankRevision: conceptSeedSnapshot.revision,
    bankSnapshot,
  };
}

export async function previewBankFinal(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability>; operations?: readonly MeetingRevisionInput[] }): Promise<{
  preview: BankPreview;
  finalValues: { concept_seed: string; story_locks: string; open_questions: string };
  directionDiff: DirectionDiffEntry[];
  directionRevision: number;
  pendingDecisions: PendingMeetingDecision[];
}> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  const plan = await computeBankPlan({ session, mutability: input.mutability, operations: input.operations });
  return { preview: plan.preview, finalValues: plan.finalValues, directionDiff: plan.directionDiff, directionRevision: plan.directionRevision, pendingDecisions: plan.pendingDecisions };
}

export async function bankInterview(input: { sessionId: string; projectId: string; mutability?: Record<string, Mutability>; operations?: readonly MeetingRevisionInput[] }): Promise<InterviewBankResult> {
  const session = await interviewStore.getInterviewSession(input.sessionId);
  if (!session) throw new Error(`Interview session ${input.sessionId} not found.`);
  assertSessionProject(session.project_id, input.projectId);
  if (session.state === 'banked' || session.state === 'exported') {
    const preview = await previewBank({ ...input, mutability: session.bank_snapshot?.applied_classifications ?? input.mutability ?? {} });
    return { session, preview };
  }
  if (session.state !== 'readback') throw new Error('Only readback sessions can be banked.');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const plan = await computeBankPlan({ session, mutability: input.mutability, operations: input.operations });
    if (plan.finalValues.story_locks.length > 2000) {
      throw new Error('Story locks block exceeds maximum length (2000 chars after merging Meeting locks). Consolidate locks at readback before banking.');
    }
    emitMeetingTrace({ type: 'meeting.ledger.bank_started', projectId: session.project_id, sessionId: session.id, attempt, pendingCount: plan.pendingDecisions.length });
    const rpc = await getRoomDb().rpc('bank_meeting_round', {
      p_project_id: session.project_id,
      p_session_id: session.id,
      p_bank_revision: plan.bankRevision,
      p_direction_revision: plan.directionRevision,
      p_concept_seed: plan.finalValues.concept_seed,
      p_locks_expected: plan.locksExpected,
      p_locks_next: plan.finalValues.story_locks,
      p_open_questions: plan.finalValues.open_questions,
      p_bank_snapshot: plan.bankSnapshot,
      p_decisions: plan.pendingDecisions,
    });
    if (!rpc.error) {
      const refreshed = await interviewStore.getInterviewSession(session.id);
      if (!refreshed) throw new Error('Bank completed but the canonical session could not be reloaded.');
      if (rpc.data === 'already_banked') {
        const storedPreview = await previewBank({ ...input, mutability: refreshed.bank_snapshot?.applied_classifications ?? {} });
        return { session: refreshed, preview: storedPreview };
      }
      emitMeetingTrace({ type: 'meeting.ledger.bank_committed', projectId: session.project_id, sessionId: session.id, pendingCount: plan.pendingDecisions.length });
      return { session: refreshed, preview: plan.preview, directionDiff: plan.directionDiff, directionRevision: plan.directionRevision };
    }
    const conflict = ['locks_conflict', 'projection_conflict', 'direction_conflict'].find((name) => rpc.error?.message.includes(name));
    if (!conflict) {
      throw new Error(`Bank failed: ${rpc.error.message}`);
    }
    emitMeetingTrace({ type: 'meeting.ledger.bank_conflict', projectId: session.project_id, sessionId: session.id, attempt, conflict });
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
