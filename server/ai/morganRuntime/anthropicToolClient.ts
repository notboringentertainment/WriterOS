// Morgan Runtime — boxed Anthropic tool client.
// THE ONLY place @anthropic-ai/sdk and Anthropic content-block shapes (tool_use,
// tool_result) live. Everything else consumes the provider-agnostic ToolTurn.
// Claude-native by design: this never falls back to another provider.

import Anthropic from '@anthropic-ai/sdk';
import type { ToolSpec, ToolTurn, ToolUse } from './types';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1600;
const MAX_PAUSE_TURNS = 3;

export type AnthropicToolSpec = ToolSpec | Anthropic.ToolUnion;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Message-builder helpers. They return Anthropic-shaped message objects so the
// runner can compose turns without knowing the block layout. Typed loosely on
// purpose — the shapes stay private to this module.
export function userTurn(text: string): unknown {
  return { role: 'user', content: text };
}

export function assistantTurn(content: unknown): unknown {
  return { role: 'assistant', content };
}

// Anthropic requires ALL tool_results for one assistant turn to arrive in a
// SINGLE user message. Pass every non-terminal result from the turn at once.
export function toolResultsTurn(results: Array<{ toolUseId: string; content: string }>): unknown {
  return {
    role: 'user',
    content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.toolUseId, content: r.content })),
  };
}

export async function sendStreamingMessage(input: {
  system?: string;
  messages: unknown[];
  tools?: AnthropicToolSpec[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  // Optional model override — the room's digest tier passes a cheap model here;
  // absent, behavior is identical to before this param existed.
  model?: string;
  // Optional raw stream-event tap — the room runtime extracts live `speak`
  // input deltas for SSE. Absent, nothing changes.
  onStreamEvent?: (event: Anthropic.RawMessageStreamEvent) => void;
  // Fired once per internal API call, including pause_turn continuations.
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}): Promise<Anthropic.Message> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 10 * 60 * 1000,
    maxRetries: 2,
  });

  let messages = [...input.messages];
  let response: Anthropic.Message | undefined;

  for (let i = 0; i <= MAX_PAUSE_TURNS; i += 1) {
    const stream = client.messages.stream({
      model: input.model ?? ANTHROPIC_MODEL,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(input.system ? { system: input.system } : {}),
      messages: messages as Anthropic.MessageParam[],
      ...(input.tools ? { tools: input.tools as Anthropic.ToolUnion[], tool_choice: { type: 'auto' as const } } : {}),
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    }, input.signal ? { signal: input.signal } : undefined);

    if (input.onStreamEvent) {
      stream.on('streamEvent', input.onStreamEvent);
    }

    response = await stream.finalMessage();
    if (input.onUsage && response.usage) {
      input.onUsage({
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      });
    }
    if (response.stop_reason !== 'pause_turn') return response;
    messages = [...messages, assistantTurn(response.content)];
  }

  throw new Error(`Anthropic pause_turn did not complete after ${MAX_PAUSE_TURNS + 1} turns`);
}

export async function sendToolTurn(input: {
  system: string;
  messages: unknown[];
  tools: AnthropicToolSpec[];
  maxTokens?: number;
  model?: string;
  onStreamEvent?: (event: Anthropic.RawMessageStreamEvent) => void;
  // Token accounting tap for the room's agent_turn_ledger. Absent, no change.
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}): Promise<ToolTurn> {
  const response = await sendStreamingMessage({
    system: input.system,
    messages: input.messages as Anthropic.MessageParam[],
    tools: input.tools,
    maxTokens: input.maxTokens,
    model: input.model,
    onStreamEvent: input.onStreamEvent,
    onUsage: input.onUsage,
  });

  const toolUses: ToolUse[] = [];
  const textParts: string[] = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      toolUses.push({ id: block.id, name: block.name, input: block.input });
    } else if (block.type === 'text') {
      textParts.push(block.text);
    }
  }

  return {
    stopReason: response.stop_reason ?? 'end_turn',
    toolUses,
    text: textParts.join('\n'),
    assistantContent: response.content,
  };
}
