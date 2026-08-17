import type { ComposedDocument, ComposeIdentity } from '../../../shared/compose/types'
import { ComposedDocumentSchema } from '../../../shared/compose/schemas'
import type { OutlineDocumentContent } from '../../../shared/documents'
import type { MemoryReceipt } from '../../../shared/schema'
import { parseMemoryReceipt } from './memoryReceipt'

export async function requestOutlineCompose(input: {
  projectId?: string
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
}): Promise<{ ok: true; composed: ComposedDocument; memoryReceipt?: MemoryReceipt } | { ok: false; reason: string; memoryReceipt?: MemoryReceipt }> {
  const res = await fetch('/api/compose-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ surface: 'outline', ...input }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const memoryReceipt = parseMemoryReceipt(body?.memoryReceipt)
    return { ok: false, reason: body?.reason ?? `HTTP ${res.status}`, ...(memoryReceipt ? { memoryReceipt } : {}) }
  }
  const body = await res.json().catch(() => null)
  const parsed = ComposedDocumentSchema.safeParse(body?.composed)
  if (!parsed.success) return { ok: false, reason: 'invalid_compose_response' }
  const memoryReceipt = parseMemoryReceipt(body?.memoryReceipt)
  return { ok: true, composed: parsed.data, ...(memoryReceipt ? { memoryReceipt } : {}) }
}
