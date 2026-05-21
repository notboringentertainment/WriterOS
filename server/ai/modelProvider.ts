import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type ModelMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ModelProviderName = 'openai' | 'anthropic';

export interface ModelProvider {
  name: ModelProviderName;
  model: string;
  isConfigured(): boolean;
  generateResponse(input: {
    systemPrompt: string;
    messages: ModelMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-sonnet-4-6";

class OpenAIProvider implements ModelProvider {
  name = 'openai' as const;
  model = OPENAI_MODEL;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generateResponse(input: {
    systemPrompt: string;
    messages: ModelMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        ...input.messages,
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 800,
      response_format: { type: "json_object" },
    });

    return response.choices[0].message.content || '';
  }
}

class AnthropicProvider implements ModelProvider {
  name = 'anthropic' as const;
  model = ANTHROPIC_MODEL;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generateResponse(input: {
    systemPrompt: string;
    messages: ModelMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: this.model,
      system: input.systemPrompt,
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 800,
    });

    return response.content
      .map(block => block.type === 'text' ? block.text : '')
      .filter(Boolean)
      .join('\n');
  }
}

export function getConfiguredProviderName(): ModelProviderName {
  const configured = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  return configured === 'anthropic' ? 'anthropic' : 'openai';
}

export function createModelProvider(): ModelProvider {
  return getConfiguredProviderName() === 'anthropic'
    ? new AnthropicProvider()
    : new OpenAIProvider();
}
