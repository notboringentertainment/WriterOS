import { runNativeResearchTool, type NativeResearchToolResult } from '../ai/agentRuntime/tools/research'
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
import { buildPersonaCapabilityFallbackMessage } from './fallback'
import {
  EMPTY_RESEARCH_TASK_RESULT,
  type ResearchSource,
  type ResearchTaskResult,
} from './researchTypes'

export { parseResearchTaskResult } from './researchParsing'

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
  runResearch?: (request: PersonaCapabilityRequest, deps: { signal?: AbortSignal }) => Promise<NativeResearchToolResult>
  synthesizeFinal: (input: PersonaCapabilitySynthesisInput) => Promise<PersonaCapabilitySynthesisResult>
  signal?: AbortSignal
  now?: () => Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function markCitedSources(sources: ResearchSource[], citedLabels: string[], citedUrls: string[] = []): CapabilityReceiptSource[] {
  const cited = new Set(citedLabels.map(label => label.toLowerCase()))
  const citedSourceUrls = new Set(citedUrls.map(url => safeHttpUrl(url)?.toLowerCase()).filter(Boolean) as string[])
  return normalizeSources(sources).map(source => ({
    ...source,
    citedInFinal: cited.has(source.label.toLowerCase()) ||
      Boolean(source.url && citedSourceUrls.has(source.url.toLowerCase())),
  }))
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

function buildTaskSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; abortReason: () => PersonaCapabilityFailureReason | undefined } {
  const controller = new AbortController()
  let reason: PersonaCapabilityFailureReason | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined

  const abortFromExternal = () => {
    reason = 'aborted'
    controller.abort()
  }

  if (externalSignal?.aborted) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
    timeout = setTimeout(() => {
      reason = 'timeout'
      controller.abort()
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    abortReason: () => reason,
    cleanup: () => {
      if (timeout) clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    },
  }
}

export async function runPersonaTask(
  request: PersonaCapabilityRequest,
  deps: PersonaCapabilityDeps
): Promise<PersonaCapabilityResponse> {
  const entry = getPersonaCapabilityAllowlistEntry(request.personaId, request.taskKind)
  if (!entry) throw new Error('Capability is not allowlisted')

  const startedAt = deps.now?.() ?? new Date()
  let status: PersonaCapabilityStatus = 'ok'
  let failureReason: PersonaCapabilityFailureReason | undefined
  let taskResult: ResearchTaskResult = EMPTY_RESEARCH_TASK_RESULT
  let citedSourceUrls: string[] = []
  const taskSignal = buildTaskSignal(deps.signal, entry.softTimeoutMs)

  try {
    const runResearch = deps.runResearch ?? runNativeResearchTool
    const research = await runResearch(request, { signal: taskSignal.signal })
    taskResult = research.taskResult
    citedSourceUrls = research.citedSourceUrls
    const abortReason = taskSignal.abortReason()
    if (abortReason || deps.signal?.aborted) {
      throw Object.assign(
        new Error(abortReason === 'timeout' ? 'Research request timed out' : 'Research request cancelled'),
        { failureReason: abortReason ?? 'aborted' },
      )
    }
  } catch (error) {
    failureReason = taskSignal.abortReason() ?? failureReasonFrom(error)
    status = failureReason === 'aborted'
      ? 'cancelled'
      : failureReason === 'timeout' ? 'timeout' : 'soft_fail'
  } finally {
    taskSignal.cleanup()
  }

  const sources = status === 'ok' ? taskResult.sources : []
  let synthesis: PersonaCapabilitySynthesisResult

  if (status === 'cancelled') {
    const completedAt = deps.now?.() ?? new Date()
    const receipt = buildReceipt({
      request,
      startedAt,
      completedAt,
      status,
      failureReason,
      sources: [],
    })
    return { finalMessage: '', receipt, status }
  }

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
  const receiptSources = markCitedSources(sources, synthesis.citedLabels, citedSourceUrls)
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
