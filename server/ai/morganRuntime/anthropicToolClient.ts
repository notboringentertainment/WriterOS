// Morgan Runtime — boxed Anthropic tool client.
// THE ONLY place @anthropic-ai/sdk and Anthropic content-block shapes (tool_use,
// tool_result) live. Everything else consumes the provider-agnostic ToolTurn.
// Claude-native by design: this never falls back to another provider.

import Anthropic from '@anthropic-ai/sdk';
import type { ToolSpec, ToolTurn, ToolUse } from './types';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1600;

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

export function toolResultTurn(toolUseId: string, content: string): unknown {
  return { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] };
}

export async function sendToolTurn(input: {
  system: string;
  messages: unknown[];
  tools: ToolSpec[];
  maxTokens?: number;
}): Promise<ToolTurn> {
  // Generous timeout + retries mirror the resilience pattern in modelProvider.ts.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 10 * 60 * 1000,
    maxRetries: 2,
  });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: input.system,
    messages: input.messages as Anthropic.MessageParam[],
    tools: input.tools as Anthropic.Tool[],
    tool_choice: { type: 'auto' },
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
