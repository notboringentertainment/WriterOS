// Project Meeting interview — shared type contracts (Phase 2, Slice 1).
// Row shapes mirror the §A4 + §A7.2 Supabase schema. These types are the
// contract between the interview store layer and future runtime/UI code.

import type { ProposalKind, ProposalOrigin, ProposalRow } from '../types';

// ---- §A4 session state machine ----

export type InterviewMode = 'quick' | 'full';

export type InterviewSessionState =
  | 'intake'
  | 'auditing'
  | 'interviewing'
  | 'readback'
  | 'banked'
  | 'exported'
  | 'paused';

// ---- §A5.2 audit verdicts ----

export type AuditVerdict = 'SUFFICIENT' | 'THIN';

export interface AuditVerdicts {
  // Keyed by audit area name (e.g. 'locks', 'ending', 'backstory', 'open_questions').
  // Speculative projects add 'world_rules'.
  [area: string]: AuditVerdict;
}

// ---- §A4 session cursor ----

export interface InterviewCursor {
  // Current lane being interviewed (persona id), or null between phases.
  lane: string | null;
  // Question id from the question bank (§A6), or null if not mid-question.
  question_id: string | null;
  // Budgets spent per lane, keyed by persona id. Per-area budgets from §A6.
  budgets_spent: Record<string, number>;
}

/**
 * Canonical default cursor for fresh interview sessions.
 * Must match the migration default for the `cursor` column.
 */
export const DEFAULT_INTERVIEW_CURSOR: Readonly<InterviewCursor> = Object.freeze({
  lane: null,
  question_id: null,
  budgets_spent: {},
});

// ---- §A7.2 transcript entry ----

export type AnswerDisposition = 'field_mapped' | 'seed_color' | 'skipped_delegated';

export interface TranscriptEntry {
  question_id: string;
  question_text?: string;
  domain?: string;
  lane: string;             // persona id of the asking agent
  answer_text: string;      // verbatim writer answer
  origin: ProposalOrigin | null;     // null for skipped/delegated
  disposition: AnswerDisposition;
  at: string;               // ISO timestamp
}

export type MeetingMutability = 'locked' | 'leaning' | 'open';

export type MeetingDecisionOp = 'assert' | 'revise' | 'retract' | 'supersede' | 'redirect';

export interface MeetingDecisionContent {
  statement: string;
  mutability: MeetingMutability;
  originMarker: '[SEED]' | '[EXTRAPOLATED]' | '[INVENTED]';
  disposition: AnswerDisposition;
}

export interface MeetingDecisionRow {
  id: string;
  project_id: string;
  session_id: string;
  area: string;
  field_path: string;
  op: MeetingDecisionOp;
  content: MeetingDecisionContent | Record<string, never>;
  targets: string[];
  created_at: string;
}

export interface MeetingBankSnapshot {
  applied_classifications: Record<string, MeetingMutability>;
  open_questions: string[];
  legacy_open_questions: string[];
}

// ---- §A4 row shape (mirrors interview_sessions table) ----

export interface InterviewSessionRow {
  id: string;
  project_id: string;
  mode: InterviewMode;
  state: InterviewSessionState;
  seed_text: string;
  audit: AuditVerdicts;
  cursor: InterviewCursor;
  answers: TranscriptEntry[];
  bank_snapshot: MeetingBankSnapshot | null;
  created_at: string;
  updated_at: string;
}

// ---- §A7.2 extended proposal row ----

export interface InterviewProposalRow extends ProposalRow {
  kind: ProposalKind;
  session_id: string | null;
  question_id: string | null;
  origin: ProposalOrigin | null;
}
