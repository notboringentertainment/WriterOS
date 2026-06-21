// Morgan Runtime — the loop runner. Provider-agnostic: it owns the tool loop,
// dispatch, retry-once-on-malformed, and honest-error policy. Anthropic specifics
// live behind anthropicToolClient. No hollow fallback ever reaches the writer.

import {
  isAnthropicConfigured,
  sendToolTurn,
  userTurn,
  assistantTurn,
  toolResultsTurn,
} from './anthropicToolClient';
import { MORGAN_TOOLS, dispatchTool, ASK_SPECIALIST_TOOL_NAME, RESPOND_TOOL_NAME } from './tools';
import type { DispatchOutcome, MorganRuntimeResult, RunMorganInput } from './types';

const MAX_ITERS = 4;

const ONE_AT_A_TIME =
  'Consult one specialist at a time — re-issue a single askSpecialist call.';
const PREMATURE_FINAL =
  'You called respond_to_writer before seeing the specialist answer. Wait for the askSpecialist result, then call respond_to_writer with your synthesized answer.';

const honestError = (message: string): MorganRuntimeResult => ({
  message,
  suggestions: [],
  ok: false,
});

const NOT_CONFIGURED_MESSAGE =
  "I can't reach my runtime right now — my Claude backend isn't configured (ANTHROPIC_API_KEY is not set), " +
  "so I'm not going to fake an answer. Set the key and I'll be myself again.";

const MALFORMED_MESSAGE =
  "I couldn't produce a clean response just now — I kept answering without delivering it properly. " +
  "Rather than hand you something hollow, I'm flagging the failure. Try rephrasing or resend.";

const THREW_MESSAGE =
  "I hit an error reaching my Claude backend and couldn't complete that. I'd rather say so plainly than fake a reply — please try again.";

// Run the tool loop once. Returns a result, or null if no terminal tool was
// reached (the caller decides whether to retry or error honestly).
async function runLoop(input: RunMorganInput, extraSeed: unknown[]): Promise<MorganRuntimeResult | null> {
  const messages: unknown[] = [
    ...input.history.map((m) => (m.role === 'assistant' ? assistantTurn(m.content) : userTurn(m.content))),
    userTurn(input.userMessage),
    ...extraSeed,
  ];

  for (let i = 0; i < MAX_ITERS; i++) {
    const turn = await sendToolTurn({ system: input.systemPrompt, messages, tools: MORGAN_TOOLS });

    if (turn.toolUses.length === 0) {
      return null; // model answered without the terminal tool — malformed for our contract
    }

    // Parallel guard: M2 allows one specialist per turn. If the model fans out to
    // multiple askSpecialist calls, execute NONE of them — error each one so they
    // never run concurrently. Other tools (e.g. a read) in the turn still dispatch.
    const askCount = turn.toolUses.filter((u) => u.name === ASK_SPECIALIST_TOOL_NAME).length;

    // Promise.all preserves array order → the assistant/tool_result batching below
    // stays matched to turn.toolUses (the P1 history contract).
    const ctx = { inventory: input.inventory, deps: input.deps };
    const outcomes = await Promise.all(
      turn.toolUses.map((use): Promise<DispatchOutcome> => {
        if (askCount > 1 && use.name === ASK_SPECIALIST_TOOL_NAME) {
          return Promise.resolve({ kind: 'error', toolUseId: use.id, content: ONE_AT_A_TIME });
        }
        return dispatchTool(use, ctx);
      }),
    );

    const final = outcomes.find((o): o is Extract<DispatchOutcome, { kind: 'final' }> => o.kind === 'final');
    const consulted = turn.toolUses.some((u) => u.name === ASK_SPECIALIST_TOOL_NAME);

    // Accept a final ONLY when no specialist was consulted in the same turn. A
    // respond_to_writer issued alongside askSpecialist is premature — the model
    // hasn't seen the specialist's read yet, so we feed the read back and re-ask.
    if (final && !consulted) {
      return final.result;
    }

    // Anthropic contract: one assistant message with all tool_use blocks, then
    // ONE user message carrying every matching tool_result.
    const results = outcomes
      .filter((o): o is Extract<DispatchOutcome, { kind: 'continue' | 'error' }> => o.kind !== 'final')
      .map((o) => ({ toolUseId: o.toolUseId, content: o.content }));
    // Premature final: the respond_to_writer tool_use still needs a tool_result so
    // the Anthropic history stays valid. Nudge it to wait for the specialist read.
    if (final && consulted) {
      const respondUse = turn.toolUses.find((u) => u.name === RESPOND_TOOL_NAME);
      if (respondUse) results.push({ toolUseId: respondUse.id, content: PREMATURE_FINAL });
    }
    messages.push(assistantTurn(turn.assistantContent));
    messages.push(toolResultsTurn(results));
  }

  return null; // exhausted iterations without a terminal tool
}

export async function runMorgan(input: RunMorganInput): Promise<MorganRuntimeResult> {
  if (!isAnthropicConfigured()) {
    return honestError(NOT_CONFIGURED_MESSAGE);
  }

  try {
    const first = await runLoop(input, []);
    if (first) return first;

    // Retry once with an explicit repair nudge.
    const retry = await runLoop(input, [
      userTurn('You must finish by calling the respond_to_writer tool with your answer. Do not answer in plain text.'),
    ]);
    if (retry) return retry;

    return honestError(MALFORMED_MESSAGE);
  } catch (error) {
    console.error('Morgan runtime error:', error);
    return honestError(THREW_MESSAGE);
  }
}
