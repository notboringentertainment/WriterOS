import type { LookDraft, LookEntityKind, LooksDocument } from '@shared/looks'
import { lookDraftKey } from '@shared/looks'
import type { ProjectMemorySnapshot } from '@shared/projectMemory'
import type { LookSpec } from '@shared/lookSpec'

// Pure edits on documents/looks.json (look sessions plan, Task 6). The Look
// panel's form is the only caller that writes spec fields, and every field it
// writes is recorded as writer-typed. Nothing here ever reads a model reply.

export interface LookTarget {
  entityKind: LookEntityKind
  entityId: string
  entityName: string
}

export const CURRENT_LOOK_VERSION = '1.1'

export function slugifyEntityName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return slug || 'untitled'
}

export function draftFor(doc: LooksDocument | undefined, target: LookTarget): LookDraft | undefined {
  return doc?.drafts[lookDraftKey(target.entityKind, target.entityId)]
}

/** The draft for `target`, created with the entity id prefilled when absent. */
export function ensureDraft(doc: LooksDocument, target: LookTarget, sessionId: string, now: string): LooksDocument {
  const key = lookDraftKey(target.entityKind, target.entityId)
  if (doc.drafts[key]) return doc
  return {
    ...doc,
    drafts: {
      ...doc.drafts,
      [key]: {
        sessionId,
        entityKind: target.entityKind,
        entityName: target.entityName,
        reference: 'unasked',
        // The writer chose the entity and its kind when opening the look; the id is
        // prefilled from the name they chose and is theirs to confirm or change.
        spec: { entity_kind: target.entityKind, entity_id: target.entityId },
        fieldSources: { entity_kind: 'writer', entity_id: 'writer' },
        citedRecordIds: [],
        updatedAt: now,
      },
    },
  }
}

function updateDraft(doc: LooksDocument, target: LookTarget, now: string, change: (draft: LookDraft) => LookDraft): LooksDocument {
  const key = lookDraftKey(target.entityKind, target.entityId)
  const draft = doc.drafts[key]
  if (!draft) return doc
  return { ...doc, drafts: { ...doc.drafts, [key]: { ...change(draft), updatedAt: now } } }
}

/** The writer typed `value` into `field`: store it and record writer provenance. */
export function setDraftField(doc: LooksDocument, target: LookTarget, field: string, value: unknown, now: string): LooksDocument {
  return updateDraft(doc, target, now, draft => ({
    ...draft,
    spec: { ...draft.spec, [field]: value },
    fieldSources: { ...draft.fieldSources, [field]: 'writer' },
  }))
}

/** The writer emptied `field`: remove it and its provenance. */
export function clearDraftField(doc: LooksDocument, target: LookTarget, field: string, now: string): LooksDocument {
  return updateDraft(doc, target, now, draft => {
    const { [field]: _value, ...spec } = draft.spec
    const { [field]: _source, ...fieldSources } = draft.fieldSources
    return { ...draft, spec, fieldSources }
  })
}

export function setDraftReference(doc: LooksDocument, target: LookTarget, reference: LookDraft['reference'], now: string): LooksDocument {
  return updateDraft(doc, target, now, draft => ({ ...draft, reference }))
}

/** Memory records Zoe's replies cited this session; Promote derives depends_on from them. */
export function addDraftCitations(doc: LooksDocument, target: LookTarget, ids: readonly string[], now: string): LooksDocument {
  if (ids.length === 0) return doc
  return updateDraft(doc, target, now, draft => {
    const merged = [...new Set([...draft.citedRecordIds, ...ids])].slice(-24)
    return merged.length === draft.citedRecordIds.length ? draft : { ...draft, citedRecordIds: merged }
  })
}

/**
 * What a Zoe reply may change in the draft: only the memory citations on its
 * receipt (Promote derives depends_on from them). Her text never reaches the
 * spec or provenance; this is the one place a reply touches the draft.
 */
export function applyZoeReplyToDraft(
  doc: LooksDocument,
  target: LookTarget,
  reply: { message: string; memoryReceipt?: { citations: Array<{ id: string }> } },
  now: string,
): LooksDocument {
  const cited = reply.memoryReceipt?.citations.map(citation => citation.id) ?? []
  return addDraftCitations(doc, target, cited, now)
}

export function removeDraft(doc: LooksDocument, target: LookTarget): LooksDocument {
  const key = lookDraftKey(target.entityKind, target.entityId)
  if (!doc.drafts[key]) return doc
  const { [key]: _removed, ...drafts } = doc.drafts
  return { ...doc, drafts }
}

/** The block as Promote would see it before the server derives depends_on. */
export function candidateSpec(draft: LookDraft): Record<string, unknown> {
  return { ...draft.spec, version: CURRENT_LOOK_VERSION, depends_on: [] }
}

/** Fields the writer has filled, for Zoe to move on from. */
export function filledFields(draft: LookDraft | undefined): string[] {
  if (!draft) return []
  return Object.keys(draft.spec).filter(field => field !== 'entity_kind').filter(field => {
    const value = draft.spec[field]
    return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)
  }).sort()
}

/** The draft as plain lines for Zoe to read back (data, quoted by the server). */
export function draftSummary(draft: LookDraft | undefined): string {
  if (!draft) return ''
  const lines: string[] = []
  for (const field of Object.keys(draft.spec).sort()) {
    const value = draft.spec[field]
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      lines.push(`${field}:`)
      for (const item of value) lines.push(`  - ${typeof item === 'string' ? item : JSON.stringify(item)}`)
    } else if (value && typeof value === 'object') {
      lines.push(`${field}: ${JSON.stringify(value)}`)
    } else {
      lines.push(`${field}: ${String(value)}`)
    }
  }
  return lines.join('\n').slice(0, 4000)
}

export interface PromotedLook {
  recordId: string
  entityKind: LookEntityKind
  entityId: string
  entityName: string
  lookHash: string
  spec: LookSpec
}

/** Active promoted looks in memory (canon records carrying a look_spec payload). */
export function promotedLooks(snapshot: ProjectMemorySnapshot | undefined): PromotedLook[] {
  if (!snapshot) return []
  return snapshot.records.flatMap(record => {
    if (record.kind !== 'canon' || record.status !== 'active' || record.payload?.kind !== 'look_spec') return []
    const spec = record.payload.spec
    return [{
      recordId: record.id,
      entityKind: spec.entity_kind,
      entityId: spec.entity_id,
      entityName: record.entities[0] ?? spec.entity_id,
      lookHash: record.payload.lookHash,
      spec,
    }]
  })
}

/** Promoted looks whose entity name appears (whole word, any case) in `text`. */
export function promotedLooksNamedIn(looks: readonly PromotedLook[], text: string): PromotedLook[] {
  return looks.filter(look => {
    const name = look.entityName.trim()
    if (!name) return false
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
  })
}
