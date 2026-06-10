import type { ComposedDocument, ComposeIdentity } from '../../../shared/compose/types'
import { ComposedDocumentSchema } from '../../../shared/compose/schemas'
import type { SynopsisDocumentContent } from '../../../shared/documents'

// The client validates the request payload it sends and the response it receives.
// It does NOT own the double-submit guard — that lives in SynopsisTab's compose handler.
export async function requestSynopsisCompose(input: {
  content: SynopsisDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
}): Promise<{ ok: true; composed: ComposedDocument } | { ok: false; reason: string }> {
  const res = await fetch('/api/compose-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ surface: 'synopsis', ...input }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, reason: body?.reason ?? `HTTP ${res.status}` }
  }
  const body = await res.json().catch(() => null)
  const parsed = ComposedDocumentSchema.safeParse(body?.composed)
  if (!parsed.success) return { ok: false, reason: 'invalid_compose_response' }
  return { ok: true, composed: parsed.data }
}
