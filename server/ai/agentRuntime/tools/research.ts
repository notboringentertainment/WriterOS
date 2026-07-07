import type { PersonaCapabilityFailureReason, PersonaCapabilityRequest } from '@shared/personaCapability';
import { buildResearchWorldContextPrompt } from '../../../persona-capability/buildResearchPrompt';
import { parseResearchTaskResult } from '../../../persona-capability/researchParsing';
import type { ResearchFinding, ResearchSource, ResearchTaskResult } from '../../../persona-capability/researchTypes';
import { sendStreamingMessage, userTurn, type AnthropicToolSpec } from '../../morganRuntime/anthropicToolClient';

const RESEARCH_MAX_TOKENS = 2200;

export const RESEARCH_WEB_SEARCH_TOOL: AnthropicToolSpec = {
  name: 'web_search',
  type: 'web_search_20260209',
  max_uses: 3,
};

export interface NativeResearchMessage {
  stopReason?: string;
  content: unknown[];
}

export interface NativeResearchToolResult {
  taskResult: ResearchTaskResult;
  citedSourceUrls: string[];
  partialFailure?: boolean;
}

export interface NativeResearchToolDeps {
  sendMessage?: (input: {
    system?: string;
    messages: unknown[];
    tools: AnthropicToolSpec[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }) => Promise<NativeResearchMessage>;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function fallbackLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Source';
  }
}

function uniqueSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  const result: ResearchSource[] = [];
  for (const source of sources) {
    const label = source.label.trim();
    if (!label) continue;
    const url = safeHttpUrl(source.url);
    const key = (url ?? label).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label, ...(url ? { url } : {}) });
  }
  return result.slice(0, 8);
}

function researchError(reason: PersonaCapabilityFailureReason, message: string): Error {
  return Object.assign(new Error(message), { failureReason: reason });
}

function collectWebSearchEvidence(content: unknown[]): {
  sources: ResearchSource[];
  errorCodes: string[];
  citedSourceUrls: string[];
  text: string;
} {
  const sources: ResearchSource[] = [];
  const errorCodes: string[] = [];
  const citedSourceUrls: string[] = [];
  const textParts: string[] = [];

  for (const block of content) {
    if (!isRecord(block)) continue;

    if (block.type === 'web_search_tool_result') {
      const toolContent = block.content;
      if (Array.isArray(toolContent)) {
        for (const result of toolContent) {
          if (!isRecord(result) || result.type !== 'web_search_result') continue;
          const url = safeHttpUrl(result.url);
          if (!url) continue;
          const title = typeof result.title === 'string' && result.title.trim()
            ? result.title.trim()
            : fallbackLabel(url);
          sources.push({ label: title, url });
        }
      } else if (isRecord(toolContent) && toolContent.type === 'web_search_tool_result_error') {
        if (typeof toolContent.error_code === 'string') errorCodes.push(toolContent.error_code);
      }
    }

    if (block.type === 'text') {
      if (typeof block.text === 'string') textParts.push(block.text);
      const citations = Array.isArray(block.citations) ? block.citations : [];
      for (const citation of citations) {
        if (!isRecord(citation) || citation.type !== 'web_search_result_location') continue;
        const url = safeHttpUrl(citation.url);
        if (url) citedSourceUrls.push(url);
      }
    }
  }

  return {
    sources: uniqueSources(sources),
    errorCodes,
    citedSourceUrls: Array.from(new Set(citedSourceUrls)),
    text: textParts.join('\n'),
  };
}

function alignFindingsToSources(taskResult: ResearchTaskResult, sources: ResearchSource[]): ResearchTaskResult {
  if (!sources.length) return { ...taskResult, sources: [] };

  const labels = new Set(sources.map(source => source.label.toLowerCase()));
  const urls = new Set(sources.map(source => source.url?.toLowerCase()).filter(Boolean) as string[]);
  const findings: ResearchFinding[] = [];
  const unverified = [...taskResult.unverified];

  for (const finding of taskResult.findings) {
    const labelMatches = finding.sourceLabel ? labels.has(finding.sourceLabel.toLowerCase()) : false;
    const urlMatches = finding.url ? urls.has(finding.url.toLowerCase()) : false;
    if (labelMatches || urlMatches) {
      findings.push({
        claim: finding.claim,
        verified: true,
        sourceLabel: labelMatches ? finding.sourceLabel : sources.find(source => source.url === finding.url)?.label,
        ...(finding.url ? { url: finding.url } : {}),
      });
    } else {
      unverified.push(finding.claim);
    }
  }

  return {
    ...taskResult,
    findings,
    sources,
    unverified,
  };
}

async function sendResearchMessage(
  prompt: string,
  deps: NativeResearchToolDeps,
  repair = false,
): Promise<NativeResearchMessage> {
  const sendMessage = deps.sendMessage ?? sendStreamingMessage;
  const messages = [
    userTurn(repair
      ? `${prompt}\n\nYour previous response was not valid JSON. Return ONLY the requested JSON object now.`
      : prompt),
  ];
  return sendMessage({
    system: 'You run bounded WriterOS research and return only the requested JSON object.',
    messages,
    tools: [RESEARCH_WEB_SEARCH_TOOL],
    maxTokens: RESEARCH_MAX_TOKENS,
    temperature: 0.2,
    signal: deps.signal,
  });
}

export async function runNativeResearchTool(
  request: PersonaCapabilityRequest,
  deps: NativeResearchToolDeps = {},
): Promise<NativeResearchToolResult> {
  if (deps.signal?.aborted) {
    throw researchError('aborted', 'Research request was cancelled');
  }

  const prompt = buildResearchWorldContextPrompt(request);
  let firstEvidence: ReturnType<typeof collectWebSearchEvidence> | undefined;
  let sawPartialFailure = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const message = await sendResearchMessage(prompt, deps, attempt > 0);
    const evidence = collectWebSearchEvidence(message.content);
    if (!firstEvidence || evidence.sources.length || evidence.errorCodes.length) firstEvidence = evidence;
    if (evidence.errorCodes.length && evidence.sources.length) sawPartialFailure = true;

    if (evidence.errorCodes.length && !evidence.sources.length) {
      throw researchError('upstream_error', 'Web search did not return usable sources');
    }

    try {
      const parsed = parseResearchTaskResult(evidence.text);
      const sources = evidence.sources.length ? evidence.sources : parsed.sources;
      return {
        taskResult: alignFindingsToSources(parsed, sources),
        citedSourceUrls: evidence.citedSourceUrls,
        ...(sawPartialFailure ? { partialFailure: true } : {}),
      };
    } catch (error) {
      if (attempt === 0) continue;
      console.error('[persona-capability] invalid native research result', error instanceof Error ? error.message : error);
      if (firstEvidence?.errorCodes.length && !firstEvidence.sources.length) {
        throw researchError('upstream_error', 'Web search did not return usable sources');
      }
      throw researchError('invalid_upstream', 'Native research returned invalid JSON');
    }
  }

  throw researchError('invalid_upstream', 'Native research returned invalid JSON');
}
