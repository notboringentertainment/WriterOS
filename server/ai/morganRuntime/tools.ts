// Morgan Runtime — tool specs, dispatcher, terminal validation. Pure, no network.
// M1 surface: one read tool (readProjectContext) + one terminal tool (respond_to_writer).
// M2 adds askSpecialist here; the loop/client/prompt/route need no change.

import type { DispatchOutcome, ReachInventory, ToolSpec, ToolUse } from './types';

export const READ_CONTEXT_TOOL_NAME = 'readProjectContext';
export const RESPOND_TOOL_NAME = 'respond_to_writer';

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
];

interface DispatchContext {
  inventory: ReachInventory;
}

// Clean a model-supplied string array: keep strings, trim, drop blanks.
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

const MAX_SUGGESTIONS = 3;

export function dispatchTool(use: ToolUse, ctx: DispatchContext): DispatchOutcome {
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

  return { kind: 'error', toolUseId: use.id, content: `unknown tool: ${use.name}` };
}
