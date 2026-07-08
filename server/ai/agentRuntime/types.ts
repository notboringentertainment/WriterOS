import type {
  DispatchOutcome,
  MorganRuntimeResult,
  ReachInventory,
  RuntimeDeps,
  SpecialistConsultTrace,
  ToolSpec,
  ToolTurn,
  ToolUse,
} from '../morganRuntime/types';
import type { TraceSink } from '../morganRuntime/trace';

// One model turn, injectable so callers can wrap the default Anthropic client
// (streaming taps, model overrides, usage accounting) without the loop knowing.
export type SendTurn = (input: {
  system: string;
  messages: unknown[];
  tools: ToolSpec[];
}) => Promise<ToolTurn>;

export type AgentRuntimeResult = MorganRuntimeResult;

export interface AgentToolDispatchContext {
  inventory: ReachInventory;
  deps?: RuntimeDeps;
  runId?: string;
  trace?: TraceSink;
}

export interface AgentAttributionGuard {
  findViolations(
    result: AgentRuntimeResult,
    consultLedger: Map<string, SpecialistConsultTrace>,
  ): string[];
  formatError(ids: string[]): string;
}

export interface AgentToolset {
  tools: ToolSpec[];
  terminalToolName: string;
  consultToolName?: string;
  maxConsultsPerTurn?: number;
  parallelConsultError?: string;
  prematureFinalError?: string;
  malformedNudge?: string;
  dispatchTool(use: ToolUse, ctx: AgentToolDispatchContext): Promise<DispatchOutcome>;
  attributionGuard?: AgentAttributionGuard;
}

export interface RunAgentInput {
  personaId: string;
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  inventory: ReachInventory;
  toolset: AgentToolset;
  deps?: RuntimeDeps;
  trace?: TraceSink;
  runId?: string;
  errorLogLabel?: string;
  // Optional model-turn override; defaults to the shared Anthropic tool client.
  sendTurn?: SendTurn;
}
