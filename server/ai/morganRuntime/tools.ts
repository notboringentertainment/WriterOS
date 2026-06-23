// Morgan Runtime — tool specs, dispatcher, terminal validation. Pure, no network.
// M1 surface: one read tool (readProjectContext) + one terminal tool (respond_to_writer).
// M2 adds askSpecialist here; the loop/client/prompt/route need no change.

import { CALLABLE_SPECIALIST_IDS, isCallableSpecialist } from '../../../shared/personas';
import type { DispatchOutcome, ReachInventory, RuntimeDeps, ToolSpec, ToolUse } from './types';
import type { TraceSink } from './trace';

export const READ_CONTEXT_TOOL_NAME = 'readProjectContext';
export const RESPOND_TOOL_NAME = 'respond_to_writer';
export const ASK_SPECIALIST_TOOL_NAME = 'askSpecialist';

export const MORGAN_TOOLS: ToolSpec[] = [
  {
    name: READ_CONTEXT_TOOL_NAME,
    description:
      'Return a structured inventory of exactly what you can currently see and do for this project. ' +
      'Call this when the writer asks about your reach, or when you want to ground a claim about what is in context.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: RESPOND_TOOL_NAME,
    description:
      'Deliver your final answer to the writer. You MUST call this to finish. Do not answer in plain text.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your answer to the writer.' },
        suggestions: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          maxItems: 3,
          description: '0-3 concrete next actions, only when useful.',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: ASK_SPECIALIST_TOOL_NAME,
    description:
      'Consult ONE WriterOS room specialist to get their actual read, then synthesize it yourself. ' +
      'Use only when a specialist lane is clearly the better source. One specialist per call.',
    input_schema: {
      type: 'object',
      properties: {
        specialistId: {
          type: 'string',
          enum: [...CALLABLE_SPECIALIST_IDS],
          description: 'Which specialist to consult.',
        },
        question: { type: 'string', minLength: 1, description: 'The focused question for that specialist.' },
      },
      required: ['specialistId', 'question'],
      additionalProperties: false,
    },
  },
];

interface DispatchContext {
  inventory: ReachInventory;
  deps?: RuntimeDeps; // injected runtime capabilities; askSpecialist (Task 4) consumes this
  // Observability (Slice 1). Optional so existing call sites/tests need no ctx.
  runId?: string;
  trace?: TraceSink;
}

// Clean a model-supplied string array: keep strings, trim, drop blanks.
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

const MAX_SUGGESTIONS = 3;

function specialistFailureReason(error: unknown, specialistId: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  if (typeof error === 'string' && error.trim().length > 0) return error.trim();
  return `could not reach ${specialistId}`;
}

/** Dispatch one Morgan tool_use into a model-visible result or final response. */
export async function dispatchTool(use: ToolUse, ctx: DispatchContext): Promise<DispatchOutcome> {
  if (use.name === READ_CONTEXT_TOOL_NAME) {
    return { kind: 'continue', toolUseId: use.id, content: JSON.stringify(ctx.inventory) };
  }

  if (use.name === RESPOND_TOOL_NAME) {
    const input = (use.input ?? {}) as Record<string, unknown>;
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!message) {
      return { kind: 'error', toolUseId: use.id, content: 'respond_to_writer requires a non-empty message string.' };
    }
    return {
      kind: 'final',
      result: {
        message,
        suggestions: asStringArray(input.suggestions).slice(0, MAX_SUGGESTIONS),
        ok: true,
      },
    };
  }

  if (use.name === ASK_SPECIALIST_TOOL_NAME) {
    const input = (use.input ?? {}) as Record<string, unknown>;
    const specialistId = typeof input.specialistId === 'string' ? input.specialistId : '';
    const question = typeof input.question === 'string' ? input.question.trim() : '';
    if (!question) {
      return { kind: 'error', toolUseId: use.id, content: 'askSpecialist requires a non-empty question.' };
    }
    // isCallableSpecialist excludes writingPartner (Morgan never calls herself) and unknown ids.
    if (!isCallableSpecialist(specialistId)) {
      return { kind: 'error', toolUseId: use.id, content: `askSpecialist: ${specialistId || '(none)'} is not a callable specialist.` };
    }
    if (!ctx.deps?.callSpecialist) {
      return { kind: 'error', toolUseId: use.id, content: 'askSpecialist is not wired in this context.' };
    }
    const runId = ctx.runId ?? '';
    ctx.trace?.({ kind: 'askSpecialist.started', runId, specialistId, question });
    const startedAt = Date.now();
    try {
      const answer = await ctx.deps.callSpecialist({ specialistId, question });
      ctx.trace?.({
        kind: 'askSpecialist.ok',
        runId,
        specialistId,
        durationMs: Date.now() - startedAt,
        chars: answer.message.length,
      });
      return {
        kind: 'continue',
        toolUseId: use.id,
        content: answer.message,
        consult: { specialistId, question, message: answer.message },
      };
    } catch (error) {
      const reason = specialistFailureReason(error, specialistId);
      ctx.trace?.({
        kind: 'askSpecialist.error',
        runId,
        specialistId,
        durationMs: Date.now() - startedAt,
        reason,
      });
      return { kind: 'error', toolUseId: use.id, content: `askSpecialist: could not reach ${specialistId}.` };
    }
  }

  return { kind: 'error', toolUseId: use.id, content: `unknown tool: ${use.name}` };
}
