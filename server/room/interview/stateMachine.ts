import type { InterviewCursor, InterviewSessionRow, InterviewSessionState } from './types';
import type { QuestionBankRow } from './questionBank';

export interface InterviewSessionPatch {
  state: InterviewSessionState;
  cursor: InterviewCursor;
}

type PausedCursor = InterviewCursor & { paused_from?: InterviewSessionState };

const PRE_BANKED: readonly InterviewSessionState[] = ['intake', 'auditing', 'interviewing', 'readback', 'paused'];

function cursorIndex(questions: readonly QuestionBankRow[], questionId: string | null): number {
  if (!questionId) return -1;
  return questions.findIndex((q) => q.id === questionId);
}

export function initialInterviewCursor(questions: readonly QuestionBankRow[]): InterviewCursor {
  const first = questions[0];
  return first
    ? { lane: first.lane, question_id: first.id, budgets_spent: {} }
    : { lane: null, question_id: null, budgets_spent: {} };
}

export function advanceInterviewCursor(
  session: InterviewSessionRow,
  questions: readonly QuestionBankRow[],
): InterviewSessionPatch {
  const nextQuestion = questions[cursorIndex(questions, session.cursor.question_id) + 1];
  if (!nextQuestion) {
    return { state: 'readback', cursor: { lane: null, question_id: null, budgets_spent: session.cursor.budgets_spent } };
  }
  return {
    state: 'interviewing',
    cursor: {
      lane: nextQuestion.lane,
      question_id: nextQuestion.id,
      budgets_spent: {
        ...session.cursor.budgets_spent,
        [nextQuestion.trigger]: (session.cursor.budgets_spent[nextQuestion.trigger] ?? 0) + 1,
      },
    },
  };
}

export function pauseInterviewSessionState(session: InterviewSessionRow): InterviewSessionPatch {
  if (!PRE_BANKED.includes(session.state) || session.state === 'paused') {
    throw new Error('Only active pre-banked interview sessions can be paused.');
  }
  return {
    state: 'paused',
    cursor: { ...session.cursor, paused_from: session.state } as PausedCursor,
  };
}

export function resumeInterviewSessionState(session: InterviewSessionRow): InterviewSessionPatch {
  if (session.state !== 'paused') throw new Error('Only paused interview sessions can be resumed.');
  const cursor = session.cursor as PausedCursor;
  const pausedFrom = cursor.paused_from;
  if (!pausedFrom || pausedFrom === 'paused' || pausedFrom === 'banked' || pausedFrom === 'exported') {
    throw new Error('Paused session is missing a resumable prior state.');
  }
  const { paused_from: _pausedFrom, ...rest } = cursor;
  return { state: pausedFrom, cursor: rest };
}
