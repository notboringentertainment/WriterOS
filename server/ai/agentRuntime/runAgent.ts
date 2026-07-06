import {
  assistantTurn,
  isAnthropicConfigured,
  sendToolTurn,
  toolResultsTurn,
  userTurn,
} from '../morganRuntime/anthropicToolClient';
import { createRunId, deriveRunDebug, resolveTraceSink } from '../morganRuntime/trace';
import type { DispatchOutcome, SpecialistConsultTrace } from '../morganRuntime/types';
import type { MorganTraceEvent, TraceSink } from '../morganRuntime/trace';
import type { AgentRuntimeResult, AgentToolset, RunAgentInput } from './types';

const MAX_ITERS = 4;

const NOT_CONFIGURED_MESSAGE =
  "I can't reach my runtime right now — my Claude backend isn't configured (ANTHROPIC_API_KEY is not set), " +
  "so I'm not going to fake an answer. Set the key and I'll be myself again.";

const MALFORMED_MESSAGE =
  "I couldn't produce a clean response just now — I kept answering without delivering it properly. " +
  "Rather than hand you something hollow, I'm flagging the failure. Try rephrasing or resend.";

const THREW_MESSAGE =
  "I hit an error reaching my Claude backend and couldn't complete that. I'd rather say so plainly than fake a reply — please try again.";

const honestError = (message: string): AgentRuntimeResult => ({
  message,
  suggestions: [],
  ok: false,
});

function consultCount(toolset: AgentToolset, toolUses: Array<{ name: string }>): number {
  return toolset.consultToolName
    ? toolUses.filter((use) => use.name === toolset.consultToolName).length
    : 0;
}

function terminalUses(toolset: AgentToolset, toolUses: Array<{ id: string; name: string }>) {
  return toolUses.filter((use) => use.name === toolset.terminalToolName);
}

async function runLoop(
  input: RunAgentInput,
  extraSeed: unknown[],
  runId: string,
  trace: TraceSink,
): Promise<AgentRuntimeResult | null> {
  const messages: unknown[] = [
    ...input.history.map((m) => (m.role === 'assistant' ? assistantTurn(m.content) : userTurn(m.content))),
    userTurn(input.userMessage),
    ...extraSeed,
  ];
  const consultLedger = new Map<string, SpecialistConsultTrace>();
  const toolset = input.toolset;

  for (let i = 0; i < MAX_ITERS; i++) {
    const turn = await sendToolTurn({ system: input.systemPrompt, messages, tools: toolset.tools });

    if (turn.toolUses.length === 0) {
      return null;
    }

    const activeConsultCount = consultCount(toolset, turn.toolUses);
    const consultLimit = toolset.maxConsultsPerTurn ?? Number.POSITIVE_INFINITY;
    const ctx = { inventory: input.inventory, deps: input.deps, runId, trace };
    const outcomes = await Promise.all(
      turn.toolUses.map((use): Promise<DispatchOutcome> => {
        if (
          toolset.consultToolName &&
          use.name === toolset.consultToolName &&
          activeConsultCount > consultLimit
        ) {
          return Promise.resolve({
            kind: 'error',
            toolUseId: use.id,
            content: toolset.parallelConsultError ?? `Use at most ${consultLimit} consult tool per turn.`,
          });
        }
        return toolset.dispatchTool(use, ctx);
      }),
    );

    const final = outcomes.find((o): o is Extract<DispatchOutcome, { kind: 'final' }> => o.kind === 'final');
    const consulted = Boolean(toolset.consultToolName && turn.toolUses.some((u) => u.name === toolset.consultToolName));
    for (const outcome of outcomes) {
      if (outcome.kind === 'continue' && outcome.consult) {
        consultLedger.set(outcome.consult.specialistId, outcome.consult);
      }
    }
    const attributionViolation = final && !consulted && toolset.attributionGuard
      ? toolset.attributionGuard.findViolations(final.result, consultLedger)
      : [];

    if (final && !consulted && attributionViolation.length === 0) {
      if (consultLedger.size > 0) {
        trace({ kind: 'guard.attribution', runId, status: 'passed', specialists: [...consultLedger.keys()] });
      }
      return final.result;
    }

    const results = outcomes
      .filter((o): o is Extract<DispatchOutcome, { kind: 'continue' | 'error' }> => o.kind !== 'final')
      .map((o) => ({ toolUseId: o.toolUseId, content: o.content }));
    if (final && consulted) {
      for (const use of terminalUses(toolset, turn.toolUses)) {
        results.push({
          toolUseId: use.id,
          content: toolset.prematureFinalError ?? `Wait for the ${toolset.consultToolName} result, then call ${toolset.terminalToolName}.`,
        });
      }
    }
    if (final && !consulted && attributionViolation.length > 0) {
      trace({ kind: 'guard.attribution', runId, status: 'blocked', specialists: attributionViolation });
      for (const use of terminalUses(toolset, turn.toolUses)) {
        results.push({
          toolUseId: use.id,
          content: toolset.attributionGuard?.formatError(attributionViolation) ?? 'Unverified attribution blocked.',
        });
      }
    }
    messages.push(assistantTurn(turn.assistantContent));
    messages.push(toolResultsTurn(results));
  }

  return null;
}

export async function runAgent(input: RunAgentInput): Promise<AgentRuntimeResult> {
  const runId = input.runId ?? createRunId();
  const collected: MorganTraceEvent[] = [];
  const sink = resolveTraceSink(input.trace);
  const trace: TraceSink = (event) => {
    collected.push(event);
    sink(event);
  };
  const withDebug = (result: AgentRuntimeResult): AgentRuntimeResult => ({
    ...result,
    debug: deriveRunDebug(runId, collected),
  });

  trace({ kind: 'run.started', runId, personaId: input.personaId });

  if (input.toolset.tools.length === 0) {
    trace({ kind: 'final.failed', runId, reason: 'malformed' });
    return withDebug(honestError(MALFORMED_MESSAGE));
  }

  if (!isAnthropicConfigured()) {
    trace({ kind: 'final.failed', runId, reason: 'not_configured' });
    return withDebug(honestError(NOT_CONFIGURED_MESSAGE));
  }

  try {
    const first = await runLoop(input, [], runId, trace);
    if (first) {
      trace({ kind: 'final.accepted', runId });
      return withDebug(first);
    }

    const retry = await runLoop(input, [
      userTurn(input.toolset.malformedNudge ?? `You must finish by calling the ${input.toolset.terminalToolName} tool with your answer. Do not answer in plain text.`),
    ], runId, trace);
    if (retry) {
      trace({ kind: 'final.accepted', runId });
      return withDebug(retry);
    }

    trace({ kind: 'final.failed', runId, reason: 'malformed' });
    return withDebug(honestError(MALFORMED_MESSAGE));
  } catch (error) {
    console.error(input.errorLogLabel ?? 'Agent runtime error:', error);
    trace({ kind: 'final.failed', runId, reason: 'threw' });
    return withDebug(honestError(THREW_MESSAGE));
  }
}
