import {
  personaCapabilityResponseSchema,
  type PersonaCapabilityRequest,
  type PersonaCapabilityResponse,
} from '@shared/personaCapability'

export class PersonaCapabilityHttpError extends Error {
  status: number

  constructor(status: number) {
    super(`persona-capability ${status}`)
    this.name = 'PersonaCapabilityHttpError'
    this.status = status
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError' ||
    error instanceof Error && error.name === 'AbortError'
}

export async function postPersonaCapability(
  body: PersonaCapabilityRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<PersonaCapabilityResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 270_000)
  const abortFromCaller = () => controller.abort()

  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const res = await fetch('/api/persona-capability/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) throw new PersonaCapabilityHttpError(res.status)
    return personaCapabilityResponseSchema.parse(await res.json())
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
