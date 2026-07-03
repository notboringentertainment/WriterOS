import { z } from 'zod'
import {
  getCapabilityContextChips,
  getMissingCapabilitySurfaces,
  getPersonaCapabilityAllowlistEntry,
  type CapabilityReceipt,
  type CapabilityReceiptSource,
  type PersonaCapabilityFailureReason,
  type PersonaCapabilityRequest,
  type PersonaCapabilityResponse,
  type PersonaCapabilityStatus,
} from '@shared/personaCapability'
import { buildResearchWorldContextPrompt } from './buildResearchPrompt'
import { buildPersonaCapabilityFallbackMessage } from './fallback'
import {
  EMPTY_RESEARCH_TASK_RESULT,
  type ResearchFinding,
  type ResearchSource,
  type ResearchTaskResult,
} from './researchTypes'

export interface PersonaCapabilitySynthesisInput {
  personaId: 'zoe'
  taskKind: 'research_world_context'
  userRequest: string
  projectContext: PersonaCapabilityRequest['projectContext']
  voiceProfile: PersonaCapabilityRequest['voiceProfile']
  taskResult: ResearchTaskResult
  sources: ResearchSource[]
  status: PersonaCapabilityStatus
  failureReason?: PersonaCapabilityFailureReason
}

export interface PersonaCapabilitySynthesisResult {
  finalMessage: string
  citedLabels: string[]
}

export interface PersonaCapabilityDeps {
  fetchImpl?: typeof fetch
  synthesizeFinal: (input: PersonaCapabilitySynthesisInput) => Promise<PersonaCapabilitySynthesisResult>
  baseUrl: string
  token?: string
  now?: () => Date
}

const researchSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().optional(),
})

const researchFindingSchema = z.object({
  claim: z.string().optional(),
  text: z.string().optional(),
  sourceLabel: z.string().optional(),
  label: z.string().optional(),
  url: z.string().optional(),
  verified: z.boolean().optional(),
  unverified: z.boolean().optional(),
})

const researchTaskResultSchema = z.object({
  findings: z.array(researchFindingSchema).default([]),
  sources: z.array(researchSourceSchema).default([]),
  missing: z.array(z.string()).default([]),
  unverified: z.array(z.string()).default([]),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractFirstJsonObject(raw: string): string | undefined {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]

    if (start === -1) {
      if (char === '{') {
        start = i
        depth = 1
      }
      continue
    }

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return raw.slice(start, i + 1)
  }

  return undefined
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenced) return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    const extracted = extractFirstJsonObject(value)
    if (extracted) return JSON.parse(extracted) as Record<string, unknown>
    throw new Error('Invalid JSON object')
  }
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

function normalizeSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>()
  const result: ResearchSource[] = []

  for (const source of sources) {
    const label = source.label.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const url = safeHttpUrl(source.url)
    result.push({
      label,
      ...(url ? { url } : {}),
    })
  }

  return result.slice(0, 8)
}

export function parseResearchTaskResult(rawResponse: unknown): ResearchTaskResult {
  const parsed = typeof rawResponse === 'string'
    ? parseJsonObject(rawResponse)
    : isRecord(rawResponse) ? rawResponse : undefined

  if (!parsed) {
    throw new Error('Research task returned an invalid shape')
  }

  const data = researchTaskResultSchema.parse(parsed)
  const findings: ResearchFinding[] = []
  const demotedUnverified: string[] = []

  for (const item of data.findings) {
    const claim = (item.claim || item.text || '').trim()
    if (!claim) continue
    const sourceLabel = (item.sourceLabel || item.label || '').trim()
    const explicitlyUnverified = item.unverified === true || item.verified === false

    if (!sourceLabel || explicitlyUnverified) {
      demotedUnverified.push(claim)
      continue
    }

    const finding: ResearchFinding = {
      claim,
      verified: true,
      sourceLabel,
    }
    const url = safeHttpUrl(item.url)
    if (url) finding.url = url
    findings.push(finding)
  }

  const sourceFromFindings = findings.map(finding => ({
    label: finding.sourceLabel as string,
    ...(finding.url ? { url: finding.url } : {}),
  }))

  return {
    findings,
    sources: normalizeSources([...data.sources, ...sourceFromFindings]),
    missing: data.missing.filter(item => item.trim().length > 0),
    unverified: [
      ...data.unverified.filter(item => item.trim().length > 0),
      ...demotedUnverified,
    ],
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError' ||
    error instanceof Error && error.name === 'AbortError'
}

function buildReceipt(input: {
  request: PersonaCapabilityRequest
  startedAt: Date
  completedAt: Date
  status: PersonaCapabilityStatus
  sources: CapabilityReceiptSource[]
  failureReason?: PersonaCapabilityFailureReason
}): CapabilityReceipt {
  return {
    schemaVersion: 1,
    taskKind: input.request.taskKind,
    personaId: input.request.personaId,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs: Math.max(0, input.completedAt.getTime() - input.startedAt.getTime()),
    status: input.status,
    contextChips: getCapabilityContextChips(input.request.projectContext),
    voiceProfile: {
      included: Boolean(input.request.voiceProfile),
      slice: input.request.voiceProfile ? 'world_context' : 'none',
    },
    missingSurfaces: getMissingCapabilitySurfaces(input.request.projectContext),
    sources: input.sources,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  }
}

function markCitedSources(sources: ResearchSource[], citedLabels: string[]): CapabilityReceiptSource[] {
  const cited = new Set(citedLabels.map(label => label.toLowerCase()))
  return normalizeSources(sources).map(source => ({
    ...source,
    citedInFinal: cited.has(source.label.toLowerCase()),
  }))
}

async function callOpenSwarm(request: PersonaCapabilityRequest, deps: PersonaCapabilityDeps): Promise<ResearchTaskResult> {
  const entry = getPersonaCapabilityAllowlistEntry(request.personaId, request.taskKind)
  if (!entry) throw new Error('Capability is not allowlisted')

  const fetchImpl = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), entry.softTimeoutMs)
  let response: Response

  try {
    response = await fetchImpl(`${deps.baseUrl.replace(/\/$/, '')}/open-swarm/get_response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(deps.token ? { Authorization: `Bearer ${deps.token}` } : {}),
      },
      body: JSON.stringify({
        recipient_agent: entry.upstreamRecipient,
        message: buildResearchWorldContextPrompt(request),
        chat_history: [],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    console.error('[persona-capability] upstream status', response.status)
    throw Object.assign(new Error('OpenSwarm request failed'), { failureReason: 'upstream_error' })
  }

  const payload = await response.json() as { response?: unknown; error?: unknown }
  if (payload.error) {
    console.error('[persona-capability] upstream returned an error payload')
    throw Object.assign(new Error('OpenSwarm payload error'), { failureReason: 'upstream_error' })
  }

  try {
    return parseResearchTaskResult(payload.response)
  } catch (error) {
    console.error('[persona-capability] invalid upstream research result', error instanceof Error ? error.message : error)
    throw Object.assign(new Error('Invalid upstream research result'), { failureReason: 'invalid_upstream' })
  }
}

function failureReasonFrom(error: unknown): PersonaCapabilityFailureReason {
  if (isAbortError(error)) return 'timeout'
  if (isRecord(error) && typeof error.failureReason === 'string') {
    if (['timeout', 'upstream_error', 'invalid_upstream', 'aborted'].includes(error.failureReason)) {
      return error.failureReason as PersonaCapabilityFailureReason
    }
  }
  return 'upstream_error'
}

export async function runPersonaTask(
  request: PersonaCapabilityRequest,
  deps: PersonaCapabilityDeps
): Promise<PersonaCapabilityResponse> {
  const startedAt = deps.now?.() ?? new Date()
  let status: PersonaCapabilityStatus = 'ok'
  let failureReason: PersonaCapabilityFailureReason | undefined
  let taskResult: ResearchTaskResult = EMPTY_RESEARCH_TASK_RESULT

  try {
    taskResult = await callOpenSwarm(request, deps)
  } catch (error) {
    failureReason = failureReasonFrom(error)
    status = failureReason === 'timeout' ? 'timeout' : 'soft_fail'
  }

  const sources = status === 'ok' ? taskResult.sources : []
  let synthesis: PersonaCapabilitySynthesisResult

  try {
    synthesis = await deps.synthesizeFinal({
      personaId: request.personaId,
      taskKind: request.taskKind,
      userRequest: request.message,
      projectContext: request.projectContext,
      voiceProfile: request.voiceProfile,
      taskResult: status === 'ok' ? taskResult : EMPTY_RESEARCH_TASK_RESULT,
      sources,
      status,
      failureReason,
    })
  } catch (error) {
    console.error('[persona-capability] synthesis failed', error instanceof Error ? error.message : error)
    synthesis = {
      finalMessage: buildPersonaCapabilityFallbackMessage(status, failureReason),
      citedLabels: [],
    }
  }

  const completedAt = deps.now?.() ?? new Date()
  const receiptSources = markCitedSources(sources, synthesis.citedLabels)
  const receipt = buildReceipt({
    request,
    startedAt,
    completedAt,
    status,
    failureReason,
    sources: receiptSources,
  })

  console.log(
    `[persona-capability] personaId=${request.personaId} taskKind=${request.taskKind} ` +
    `status=${status} durationMs=${receipt.durationMs} sources=${receipt.sources.length} ` +
    `contextChips=${receipt.contextChips.length} vpIncluded=${receipt.voiceProfile.included}`
  )

  return {
    finalMessage: synthesis.finalMessage,
    receipt,
    status,
  }
}
