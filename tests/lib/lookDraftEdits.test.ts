import { describe, expect, it } from 'vitest'
import {
  addDraftCitations, applyZoeReplyToDraft, candidateSpec, isPristineDraft, matchesPromotedLook, startDraftFromPromoted, clearDraftField, draftSummary, ensureDraft, filledFields, promotedLooksNamedIn,
  removeDraft, setDraftField, setDraftReference, slugifyEntityName, type LookTarget,
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

  it('starting from the promoted look copies the writer\'s own answers, marked writer-typed, and only still-active citations', () => {
    const promotedSpec = {
      version: '1.1', entity_kind: 'character', entity_id: 'vector-engineer', hair: 'cropped', props: ['wrench'],
      depends_on: [{ writeros_record_id: `mem_${'a'.repeat(32)}`, content_hash: 'f'.repeat(64) }, { writeros_record_id: `mem_${'b'.repeat(32)}`, content_hash: 'e'.repeat(64) }],
    }
    const prior = { recordId: 'mem_p', entityKind: 'character' as const, entityId: 'vector-engineer', entityName: 'Vector Engineer',
      lookHash: 'x', reference: 'generated-elsewhere' as const, spec: promotedSpec as never }
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    expect(isPristineDraft(doc.drafts['character:vector-engineer'])).toBe(true)
    doc = startDraftFromPromoted(doc, target, prior, new Set([`mem_${'a'.repeat(32)}`]), NOW)
    const draft = doc.drafts['character:vector-engineer']
    expect(draft.spec).toEqual({ entity_kind: 'character', entity_id: 'vector-engineer', hair: 'cropped', props: ['wrench'] })
    expect(Object.keys(draft.spec).every(field => draft.fieldSources[field] === 'writer')).toBe(true)
    expect(draft.reference).toBe('generated-elsewhere')
    expect(draft.citedRecordIds).toEqual([`mem_${'a'.repeat(32)}`])
    expect(draft.sessionId).toBe('s1')
    expect(LooksDocumentSchema.safeParse(doc).success).toBe(true)
    expect(isPristineDraft(draft)).toBe(false)
    expect(matchesPromotedLook(draft, prior)).toBe(true)
    expect(matchesPromotedLook(setDraftField(doc, target, 'hair', 'shaved', NOW).drafts['character:vector-engineer'], prior)).toBe(false)
    expect(matchesPromotedLook(setDraftReference(doc, target, 'none', NOW).drafts['character:vector-engineer'], prior)).toBe(false)
  })

  it('the candidate spec trims spaces at the start and end of typed text, at every depth', () => {
    let doc = ensureDraft(emptyLooks(), target, 's1', NOW)
    doc = setDraftField(doc, target, 'hair', '  white, thinning  ', NOW)
    doc = setDraftField(doc, target, 'build', { kind: 'slight', note: ' stooped ' }, NOW)
    doc = setDraftField(doc, target, 'props', [' keys ', 'lanyard'], NOW)
    const spec = candidateSpec(doc.drafts['character:vector-engineer'])
    expect(spec.hair).toBe('white, thinning')
    expect(spec.build).toEqual({ kind: 'slight', note: 'stooped' })
    expect(spec.props).toEqual(['keys', 'lanyard'])
    // What the writer is typing stays exactly as typed.
    expect(doc.drafts['character:vector-engineer'].spec.hair).toBe('  white, thinning  ')
  })

  it('slugs names and finds promoted looks named in beat text by whole word', () => {
    expect(slugifyEntityName('  Café Noir, Level 3 ')).toBe('cafe-noir-level-3')
    const looks = [{ recordId: 'm', entityKind: 'character' as const, entityId: 'ash', entityName: 'Ash', lookHash: 'x', reference: 'none' as const, spec: {} as never }]
    expect(promotedLooksNamedIn(looks, 'Ash walks in.')).toHaveLength(1)
    expect(promotedLooksNamedIn(looks, 'The ashtray is full.')).toHaveLength(0)
  })
})
