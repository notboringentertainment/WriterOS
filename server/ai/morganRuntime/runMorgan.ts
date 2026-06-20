// Morgan Runtime — the loop runner. Provider-agnostic: it owns the tool loop,
// dispatch, retry-once-on-malformed, and honest-error policy. Anthropic specifics
// live behind anthropicToolClient. No hollow fallback ever reaches the writer.

import {
  isAnthropicConfigured,
  sendToolTurn,
  userTurn,
  assistantTurn,
  toolResultTurn,
} from './anthropicToolClient';
import { MORGAN_TOOLS, dispatchTool } from './tools';
import type { MorganRuntimeResult, RunMorganInput } from './types';

const MAX_ITERS = 4;

const honestError = (message: string): MorganRuntimeResult => ({
  message,
  suggestions: [],
  receipts: [],
  limits: [],
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

    let continued = false;
    for (const use of turn.toolUses) {
      const outcome = dispatchTool(use, { inventory: input.inventory });
      if (outcome.kind === 'final') {
        return outcome.result;
      }
      // continue | error → feed the tool result back and loop again
      messages.push(assistantTurn(turn.assistantContent));
      messages.push(toolResultTurn(outcome.toolUseId, outcome.content));
      continued = true;
    }
    if (!continued) return null;
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
