import type { ModelProvider } from '../ai/modelProvider'
import { ModelComposeOutputSchema } from '../../shared/compose/schemas'
import type { ComposedBlock, ComposeSurface } from '../../shared/compose/types'

// Per-surface output ceiling (a safety ceiling, not a length target — length stays
// rubric-only). Treatment is the longest composed artifact; 2000 risks clipping its
// JSON mid-stream or pressuring synopsis-like compression.
export const MAX_TOKENS_BY_SURFACE: Record<ComposeSurface, number> = {
  outline: 2000,
  synopsis: 2000,
  treatment: 6000,
}

export async function callComposeModel(
  provider: ModelProvider,
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ ok: true; blocks: ComposedBlock[] } | { ok: false; reason: string }> {
  let lastErr = 'unknown'
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string
    try {
      raw = await provider.generateResponse({
        systemPrompt: system,
        messages: [{ role: 'user', content: user }],
        temperature: 0.2,
        maxTokens,
      })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'provider error'; continue
    }
    const jsonText = extractJson(raw)
    const parsed = ModelComposeOutputSchema.safeParse(jsonText)
    if (parsed.success) return { ok: true, blocks: parsed.data.blocks }
    lastErr = 'invalid model JSON'
  }
  return { ok: false, reason: lastErr }
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : raw
  try { return JSON.parse(body) } catch { return null }
}
