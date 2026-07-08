import { z } from 'zod';
import type { ResearchFinding, ResearchSource, ResearchTaskResult } from './researchTypes';

const researchSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().optional(),
});

const researchFindingSchema = z.object({
  claim: z.string().optional(),
  text: z.string().optional(),
  sourceLabel: z.string().optional(),
  label: z.string().optional(),
  url: z.string().optional(),
  verified: z.boolean().optional(),
  unverified: z.boolean().optional(),
});

const researchTaskResultSchema = z.object({
  findings: z.array(researchFindingSchema).default([]),
  sources: z.array(researchSourceSchema).default([]),
  missing: z.array(z.string()).default([]),
  unverified: z.array(z.string()).default([]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractFirstJsonObject(raw: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (start === -1) {
      if (char === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return raw.slice(start, i + 1);
  }

  return undefined;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    const extracted = extractFirstJsonObject(value);
    if (extracted) return JSON.parse(extracted) as Record<string, unknown>;
    throw new Error('Invalid JSON object');
  }
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

function normalizeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  const result: ResearchSource[] = [];

  for (const source of sources) {
    const label = source.label.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const url = safeHttpUrl(source.url);
    result.push({
      label,
      ...(url ? { url } : {}),
    });
  }

  return result.slice(0, 8);
}

export function parseResearchTaskResult(rawResponse: unknown): ResearchTaskResult {
  const parsed = typeof rawResponse === 'string'
    ? parseJsonObject(rawResponse)
    : isRecord(rawResponse) ? rawResponse : undefined;

  if (!parsed) {
    throw new Error('Research task returned an invalid shape');
  }

  const data = researchTaskResultSchema.parse(parsed);
  const findings: ResearchFinding[] = [];
  const demotedUnverified: string[] = [];

  for (const item of data.findings) {
    const claim = (item.claim || item.text || '').trim();
    if (!claim) continue;
    const sourceLabel = (item.sourceLabel || item.label || '').trim();
    const explicitlyUnverified = item.unverified === true || item.verified === false;

    if (!sourceLabel || explicitlyUnverified) {
      demotedUnverified.push(claim);
      continue;
    }

    const finding: ResearchFinding = {
      claim,
      verified: true,
      sourceLabel,
    };
    const url = safeHttpUrl(item.url);
    if (url) finding.url = url;
    findings.push(finding);
  }

  const sourceFromFindings = findings.map(finding => ({
    label: finding.sourceLabel as string,
    ...(finding.url ? { url: finding.url } : {}),
  }));

  return {
    findings,
    sources: normalizeSources([...data.sources, ...sourceFromFindings]),
    missing: data.missing.filter(item => item.trim().length > 0),
    unverified: [
      ...data.unverified.filter(item => item.trim().length > 0),
      ...demotedUnverified,
    ],
  };
}
