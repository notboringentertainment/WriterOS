import { resolveCanonicalFieldPath } from './banking';
import { foldMeetingDecisions } from './meetingDecisions';
import { listMeetingDecisions } from './meetingDecisionsStore';
import { getQuestionById } from './questionBank';
import { listInterviewProposals } from './store';
import type {
  InterviewProposalRow,
  InterviewSessionRow,
  MeetingDecisionContent,
  MeetingDecisionRow,
  MeetingMutability,
  TranscriptEntry,
} from './types';

export interface InterviewAuditContext {
  activeDecisions: MeetingDecisionRow[];
  priorAnswers: TranscriptEntry[];
  storyLocks: string;
  openQuestions: string;
  coveredAreas: Set<string>;
}

export interface AuditContextInput {
  projectId: string;
  sessions: readonly InterviewSessionRow[];
  storyLocks: string;
  openQuestions: string;
}

export interface AuditContextDeps {
  listMeetingDecisions: typeof listMeetingDecisions;
  listInterviewProposals: typeof listInterviewProposals;
}

const DEFAULT_DEPS: AuditContextDeps = {
  listMeetingDecisions,
  listInterviewProposals,
};

function isTerminal(session: InterviewSessionRow): boolean {
  return session.state === 'banked' || session.state === 'exported';
}

function normalizedMutability(value: string | undefined): MeetingMutability {
  return value === 'leaning' || value === 'open' ? value : 'locked';
}

function originMarker(origin: InterviewProposalRow['origin']): MeetingDecisionContent['originMarker'] {
  if (origin === 'extrapolated') return '[EXTRAPOLATED]';
  if (origin === 'invented') return '[INVENTED]';
  return '[SEED]';
}

function areaForProposal(proposal: InterviewProposalRow): string {
  if (proposal.question_id) {
    return getQuestionById(proposal.question_id)?.trigger ?? `question:${proposal.question_id}`;
  }
  return `question:${proposal.id}`;
}

function legacyDecision(
  session: InterviewSessionRow,
  proposal: InterviewProposalRow,
  mutability: string,
): MeetingDecisionRow {
  return {
    id: `legacy:${session.id}:${proposal.id}`,
    project_id: session.project_id,
    session_id: session.id,
    area: areaForProposal(proposal),
    field_path: resolveCanonicalFieldPath(proposal.field_path, proposal),
    op: 'assert',
    content: {
      statement: (proposal.resolved_value ?? proposal.proposed_value).trim(),
      mutability: normalizedMutability(mutability),
      originMarker: originMarker(proposal.origin),
      disposition: 'field_mapped',
    },
    targets: [],
    created_at: session.updated_at,
  };
}

async function deriveLegacyDecisions(
  sessions: readonly InterviewSessionRow[],
  decisions: readonly MeetingDecisionRow[],
  deps: AuditContextDeps,
): Promise<MeetingDecisionRow[]> {
  const sessionsWithLedger = new Set(decisions.map((row) => row.session_id));
  const legacy: MeetingDecisionRow[] = [];

  for (const session of sessions.filter(isTerminal)) {
    if (sessionsWithLedger.has(session.id) || !session.bank_snapshot) continue;
    const applied = session.bank_snapshot.applied_classifications;
    const proposals = await deps.listInterviewProposals(session.id, 'adopted');
    for (const proposal of proposals) {
      const mutability = applied[proposal.id];
      if (!mutability) continue;
      legacy.push(legacyDecision(session, proposal, mutability));
    }
  }
  return legacy;
}

export async function buildAuditContext(
  input: AuditContextInput,
  deps: AuditContextDeps = DEFAULT_DEPS,
): Promise<InterviewAuditContext> {
  const terminalSessions = input.sessions.filter(isTerminal);
  const decisions = await deps.listMeetingDecisions(input.projectId);
  const legacyDecisions = await deriveLegacyDecisions(terminalSessions, decisions, deps);
  const active = foldMeetingDecisions([...decisions, ...legacyDecisions]);

  return {
    activeDecisions: active.entries,
    priorAnswers: terminalSessions.flatMap((session) => session.answers),
    storyLocks: input.storyLocks,
    openQuestions: input.openQuestions,
    coveredAreas: new Set(active.entries.map((row) => row.area)),
  };
}
