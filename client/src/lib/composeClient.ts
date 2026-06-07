import type { ComposedDocument, ComposeIdentity } from '../../../shared/compose/types'
import type { OutlineDocumentContent } from '../../../shared/documents'

export async function requestOutlineCompose(input: {
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
}): Promise<{ ok: true; composed: ComposedDocument } | { ok: false; reason: string }> {
  const res = await fetch('/api/compose-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ surface: 'outline', ...input }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, reason: body?.reason ?? `HTTP ${res.status}` }
  }
  const body = await res.json()
  return { ok: true, composed: body.composed as ComposedDocument }
}
