import { describe, expect, it } from 'vitest'
import {
  ensureDraft, isPristineDraft, openDraftFromPromoted, promotedLooks, setDraftField, setDraftName, type LookTarget, type PromotedLook,
} from '../../client/src/lib/lookDraftEdits'
import { emptyLooks, LooksDocumentSchema } from '../../shared/looks'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

const NOW = '2026-10-09T12:00:00.000Z'
const salon: LookTarget = { entityKind: 'location', entityId: 'the-salon', entityName: 'the salon' }
const prior: PromotedLook = {
  recordId: 'mem_salon', entityKind: 'location', entityId: 'the-salon', entityName: 'the salon', lookHash: 'x',
  reference: 'none', promotedAt: '2026-10-06T21:20:45.637Z',
  spec: { version: '1.1', entity_kind: 'location', entity_id: 'the-salon', palette_anchors: ['cream'], depends_on: [] } as never,
}

describe('renaming a look', () => {
  it('changes the name; the look id follows while it was derived from the old name', () => {
    let doc = ensureDraft(emptyLooks(), salon, 's1', NOW)
    doc = setDraftName(doc, salon, 'Parlor', NOW)
    const draft = doc.drafts['location:the-salon']
    expect(draft.entityName).toBe('Parlor')
    expect(draft.spec.entity_id).toBe('parlor')
    expect(draft.fieldSources.entity_id).toBe('writer')
    expect(LooksDocumentSchema.safeParse(doc).success).toBe(true)
  })

  it('leaves a look id the writer typed themselves alone', () => {
    let doc = ensureDraft(emptyLooks(), salon, 's1', NOW)
    doc = setDraftField(doc, salon, 'entity_id', 'mansion-room', NOW)
    doc = setDraftName(doc, salon, 'Parlor', NOW)
    expect(doc.drafts['location:the-salon'].spec.entity_id).toBe('mansion-room')
  })

  it('refuses an empty name', () => {
    const doc = ensureDraft(emptyLooks(), salon, 's1', NOW)
    expect(setDraftName(doc, salon, '   ', NOW)).toBe(doc)
  })
})

describe('opening a promoted look from the Looks list', () => {
  it('creates the draft already filled with the promoted answers', () => {
    const doc = openDraftFromPromoted(emptyLooks(), salon, prior, new Set(), 's1', NOW)
    const draft = doc.drafts['location:the-salon']
    expect(draft.sessionId).toBe('s1')
    expect(draft.spec.palette_anchors).toEqual(['cream'])
    expect(isPristineDraft(draft)).toBe(false)
  })

  it('keeps a draft already in progress', () => {
    let doc = ensureDraft(emptyLooks(), salon, 's0', NOW)
    doc = setDraftField(doc, salon, 'palette_anchors', ['gold'], NOW)
    expect(openDraftFromPromoted(doc, salon, prior, new Set(), 's1', NOW)).toBe(doc)
  })
})

describe('promoted looks', () => {
  it('carry the date they were last promoted', () => {
    const snapshot = {
      schemaVersion: 1, projectId: 'p', revision: 3, conflicts: [],
      records: [{
        id: 'mem_salon', kind: 'canon', status: 'active', entities: ['the salon'], createdAt: '2026-10-06T21:20:45.637Z', updatedAt: '2026-10-06T21:20:45.637Z',
        payload: { kind: 'look_spec', lookHash: 'x', reference: 'none', spec: prior.spec },
      }],
    } as unknown as ProjectMemorySnapshot
    expect(promotedLooks(snapshot)[0].promotedAt).toBe('2026-10-06T21:20:45.637Z')
  })
})

describe('review fixes', () => {
  it('a renamed draft counts as in progress: reopening the promoted look keeps the rename', () => {
    let doc = ensureDraft(emptyLooks(), salon, 's0', NOW)
    doc = setDraftName(doc, salon, 'Parlor', NOW)
    expect(openDraftFromPromoted(doc, salon, prior, new Set(), 's1', NOW)).toBe(doc)
  })
})
