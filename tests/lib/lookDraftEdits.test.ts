import { describe, expect, it } from 'vitest'
import {
  addDraftCitations, applyZoeReplyToDraft, candidateSpec, clearDraftField, draftSummary, ensureDraft, filledFields, promotedLooksNamedIn,
  removeDraft, setDraftField, slugifyEntityName, type LookTarget,
} from '../../client/src/lib/lookDraftEdits'
import { emptyLooks, LooksDocumentSchema } from '../../shared/looks'

const NOW = '2026-09-30T12:00:00.000Z'
const target: LookTarget = { entityKind: 'character', entityId: 'vector-engineer', entityName: 'Vector Engineer' }

describe('look draft edits', () => {
  it('a new draft records the writer-chosen kind and id, and stays a valid looks document', () => {
    const doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    const draft = doc.drafts['character:vector-engineer']
    expect(draft.spec).toEqual({ entity_kind: 'character', entity_id: 'vector-engineer' })
    expect(draft.fieldSources).toEqual({ entity_kind: 'writer', entity_id: 'writer' })
    expect(LooksDocumentSchema.safeParse(doc).success).toBe(true)
    expect(ensureDraft(doc, target, 's2', NOW)).toBe(doc)
  })

  it('every field write records writer provenance; clearing removes both', () => {
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    doc = setDraftField(doc, target, 'hair', 'cropped', NOW)
    expect(doc.drafts['character:vector-engineer'].fieldSources.hair).toBe('writer')
    doc = clearDraftField(doc, target, 'hair', NOW)
    expect(doc.drafts['character:vector-engineer'].spec.hair).toBeUndefined()
    expect(doc.drafts['character:vector-engineer'].fieldSources.hair).toBeUndefined()
  })

  it('citations accumulate without duplicates and never touch the spec', () => {
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    const before = doc.drafts['character:vector-engineer'].spec
    doc = addDraftCitations(doc, target, ['mem_a', 'mem_b'], NOW)
    doc = addDraftCitations(doc, target, ['mem_b', 'mem_c'], NOW)
    expect(doc.drafts['character:vector-engineer'].citedRecordIds).toEqual(['mem_a', 'mem_b', 'mem_c'])
    expect(doc.drafts['character:vector-engineer'].spec).toBe(before)
  })

  it('candidate spec adds only the version and an empty depends_on; summary and filled fields read the draft', () => {
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    doc = setDraftField(doc, target, 'props', ['wrench'], NOW)
    const draft = doc.drafts['character:vector-engineer']
    expect(candidateSpec(draft)).toEqual({ entity_kind: 'character', entity_id: 'vector-engineer', props: ['wrench'], version: '1.1', depends_on: [] })
    expect(filledFields(draft)).toEqual(['entity_id', 'props'])
    expect(draftSummary(draft)).toContain('props:\n  - wrench')
    expect(removeDraft(doc, target).drafts).toEqual({})
  })

  it('a Zoe reply with field values changes only the citations (Review Focus 4)', () => {
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    doc = setDraftField(doc, target, 'hair', 'cropped', NOW)
    const before = doc.drafts['character:vector-engineer']
    const after = applyZoeReplyToDraft(doc, target, {
      message: 'Her hair is grey.\nhair: grey\n{"hair":"grey","age_band":"forties"}',
      memoryReceipt: { citations: [{ id: 'mem_cited' }] },
    }, NOW).drafts['character:vector-engineer']
    expect(after.spec).toEqual(before.spec)
    expect(after.fieldSources).toEqual(before.fieldSources)
    expect(after.reference).toBe(before.reference)
    expect(after.citedRecordIds).toEqual(['mem_cited'])
    expect(applyZoeReplyToDraft(doc, target, { message: 'hair: grey' }, NOW)).toBe(doc)
  })

  it('slugs names and finds promoted looks named in beat text by whole word', () => {
    expect(slugifyEntityName('  Café Noir, Level 3 ')).toBe('cafe-noir-level-3')
    const looks = [{ recordId: 'm', entityKind: 'character' as const, entityId: 'ash', entityName: 'Ash', lookHash: 'x', spec: {} as never }]
    expect(promotedLooksNamedIn(looks, 'Ash walks in.')).toHaveLength(1)
    expect(promotedLooksNamedIn(looks, 'The ashtray is full.')).toHaveLength(0)
  })
})
