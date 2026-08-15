// WriterOS document-change analyzer (Task 8). Turns a before/after slice of a
// WriterOS document into candidate memory claims. Uses the existing
// ModelProvider abstraction only — JSON mode where the provider supports it
// (OpenAI), post-hoc parseJsonObject + Zod validation everywhere, and exactly
// one bounded retry after a schema failure. No native structured-output mode
// exists on this provider surface (see server/ai/modelProvider.ts) and none
// is added here.

import { z } from 'zod'
import type { ModelProvider } from '../ai/modelProvider'
import { parseJsonObject } from '../ai/openaiService'

export const MemoryAnalysisRecordKindSchema = z.enum([
  'document_fact',
  'decision',
  'development',
  'open_question',
])

export const MemoryAnalysisSafetySchema = z.enum(['clear', 'flagged'])

export const MemoryAnalysisRecordSchema = z.object({
  kind: MemoryAnalysisRecordKindSchema,
  claim: z.string().min(1).max(600),
  detail: z.string().max(8_000).optional(),
  tags: z.array(z.string().min(1).max(100)).max(20),
  entities: z.array(z.string().min(1).max(200)).max(30),
  evidenceExcerpt: z.string().min(1).max(1_500),
  conflictsWith: z.array(z.string().min(1).max(500)).max(20),
  safety: MemoryAnalysisSafetySchema,
}).strict()

export const MemoryAnalysisResultSchema = z.object({
  records: z.array(MemoryAnalysisRecordSchema).max(50),
}).strict()

export type MemoryAnalysisRecordKind = z.infer<typeof MemoryAnalysisRecordKindSchema>
export type MemoryAnalysisRecord = z.infer<typeof MemoryAnalysisRecordSchema>

/** Exact shape from the task brief. */
export interface MemoryAnalysisResult {
  records: Array<{
    kind: 'document_fact' | 'decision' | 'development' | 'open_question'
    claim: string
    detail?: string
    tags: string[]
    entities: string[]
    evidenceExcerpt: string
    conflictsWith: string[]
    safety: 'clear' | 'flagged'
  }>
}

export class MemoryAnalysisError extends Error {
  readonly name = 'MemoryAnalysisError'
}

export interface ActiveCanonSummary {
  id: string
  claim: string
}

export interface AnalyzeDocumentChangeInput {
  provider: ModelProvider
  /** Human label for the surface being analyzed, e.g. 'synopsis' or 'script'. */
  surface: string
  /** Prior serialized content at this anchor, or null for a brand-new anchor. */
  priorContent: string | null
  /** Current serialized content at this anchor. */
  currentContent: string
  /** Active canon available for contradiction-linking. Keep this short — it is prompt content. */
  activeCanon: ActiveCanonSummary[]
}

const SYSTEM_PROMPT = `You are WriterOS's project-memory analyzer. You read a change to one WriterOS
document surface and extract discrete story claims worth remembering.

Classify every claim you extract using exactly one of these kinds:
- "document_fact": a fact about what the CURRENT document now says. Always safe to record as-is.
- "decision": a story decision the writer appears to have made in this edit.
- "development": exploratory material or direction being tried, not yet decided.
- "open_question": a question the document leaves open or raises.

Never claim a fact is canon. You are not authorized to promote anything to canon — only report
what changed and, where relevant, which supplied canon ids it appears to contradict.

Return ONLY a JSON object shaped exactly like this, no prose and no markdown fences:
{
  "records": [
    {
      "kind": "document_fact" | "decision" | "development" | "open_question",
      "claim": "<short claim, <=600 chars>",
      "detail": "<optional longer detail>",
      "tags": ["<short tag>", "..."],
      "entities": ["<character or place name>", "..."],
      "evidenceExcerpt": "<verbatim excerpt from the CURRENT content supporting the claim, <=1500 chars>",
      "conflictsWith": ["<id from the supplied active canon list that this claim appears to contradict>"],
      "safety": "clear" | "flagged"
    }
  ]
}
Only use ids that appear in the supplied active canon list for "conflictsWith". If nothing
notable changed, return {"records": []}. Mark "safety": "flagged" for content that should not be
surfaced without human review (e.g. hateful, sexual-with-minors, or otherwise unsafe content);
otherwise use "clear".`

function renderCanonList(activeCanon: ActiveCanonSummary[]): string {
  if (activeCanon.length === 0) return '(none)'
  return activeCanon.map(entry => `- ${entry.id}: ${entry.claim}`).join('\n')
}

function buildUserPrompt(input: AnalyzeDocumentChangeInput): string {
  const priorSection = input.priorContent === null
    ? '(this is a new document — there is no prior version)'
    : input.priorContent
  return [
    `SURFACE: ${input.surface}`,
    '',
    'ACTIVE CANON (id: claim):',
    renderCanonList(input.activeCanon),
    '',
    'PRIOR CONTENT:',
    priorSection,
    '',
    'CURRENT CONTENT:',
    input.currentContent,
  ].join('\n')
}

interface AnalysisAttempt {
  ok: true
  data: MemoryAnalysisResult
}
interface AnalysisFailure {
  ok: false
  reason: string
}

async function attemptAnalysis(
  provider: ModelProvider,
  prompt: string,
): Promise<AnalysisAttempt | AnalysisFailure> {
  let raw: string
  try {
    raw = await provider.generateResponse({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 1_500,
    })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'model request failed' }
  }

  let parsedJson: unknown
  try {
    parsedJson = parseJsonObject(raw)
  } catch {
    return { ok: false, reason: 'model response was not valid JSON' }
  }

  const result = MemoryAnalysisResultSchema.safeParse(parsedJson)
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? 'schema validation failed' }
  }
  return { ok: true, data: result.data }
}

/**
 * Analyze one document-change unit. Calls the provider once; on any failure
 * (network, invalid JSON, or schema mismatch) makes exactly one bounded
 * retry with a corrective note, then throws MemoryAnalysisError.
 */
export async function analyzeDocumentChange(
  input: AnalyzeDocumentChangeInput,
): Promise<MemoryAnalysisResult> {
  const prompt = buildUserPrompt(input)
  const first = await attemptAnalysis(input.provider, prompt)
  if (first.ok) return first.data

  const retryPrompt = `${prompt}\n\nYour previous response was rejected: ${first.reason}. Return ONLY a JSON object matching the required schema — a "records" array where every item has kind, claim, tags, entities, evidenceExcerpt, conflictsWith, and safety.`
  const second = await attemptAnalysis(input.provider, retryPrompt)
  if (second.ok) return second.data

  throw new MemoryAnalysisError(
    `WriterOS memory analysis failed after one retry: ${second.reason}`,
  )
}
