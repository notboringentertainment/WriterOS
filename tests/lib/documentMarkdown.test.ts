import { describe, it, expect } from 'vitest'
import {
  createEmptyDocuments,
  createEmptySynopsisContent,
  createEmptyOutlineContent,
  createEmptyStoryBibleContent,
  createEmptyTreatmentContent,
} from '../../shared/documents'
import {
  synopsisToMarkdown,
  outlineToMarkdown,
  storyBibleToMarkdown,
  treatmentToMarkdown,
  documentsToMarkdown,
} from '../../client/src/lib/documentMarkdown'

const FIXED_TS = '2026-05-15T00:00:00.000Z'
const now = () => FIXED_TS

describe('synopsisToMarkdown', () => {
  it('emits a header followed by logline and prose when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'My Film'
    content.logline.text = 'A widow returns home.'
    content.prose.opening = 'Sara is paged.'
    const md = synopsisToMarkdown({ version: 1, mode: 'prose', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Synopsis — My Film')
    expect(md).toContain('## Logline')
    expect(md).toContain('A widow returns home.')
    expect(md).toContain('## Synopsis')
    expect(md).toContain('Sara is paged.')
  })

  it('skips empty optional sections', () => {
    const content = createEmptySynopsisContent()
    const md = synopsisToMarkdown({ version: 1, mode: 'prose', updatedAt: FIXED_TS, content })
    expect(md).not.toContain('## Logline')
    expect(md).not.toContain('## Synopsis')
    expect(md).not.toContain('## AI Production Implications')
  })

  it('output is deterministic across two calls with the same input', () => {
    const content = createEmptySynopsisContent()
    content.logline.text = 'a'
    const doc = { version: 1 as const, mode: 'prose', updatedAt: FIXED_TS, content }
    expect(synopsisToMarkdown(doc)).toBe(synopsisToMarkdown(doc))
  })
})

describe('outlineToMarkdown', () => {
  it('emits a unit per outline unit', () => {
    const content = createEmptyOutlineContent()
    content.units = [
      {
        id: 'u1',
        number: 1,
        actOrSequence: 'Act 1',
        title: 'Opening',
        location: '',
        characters: [],
        whatHappens: 'A',
        conflict: '',
        turn: '',
        consequence: '',
        whyNext: '',
        linkedSceneIds: [],
        draftNotes: '',
      },
      {
        id: 'u2',
        number: 2,
        actOrSequence: 'Act 1',
        title: 'Catalyst',
        location: '',
        characters: [],
        whatHappens: 'B',
        conflict: '',
        turn: '',
        consequence: '',
        whyNext: '',
        linkedSceneIds: [],
        draftNotes: '',
      },
    ]
    const md = outlineToMarkdown({ version: 1, mode: 'beat_sheet_save_the_cat', updatedAt: FIXED_TS, content })
    expect(md).toMatch(/1\. Opening[\s\S]+2\. Catalyst/)
  })

  it('skips unit subfields that are empty', () => {
    const content = createEmptyOutlineContent()
    content.units = [
      {
        id: 'u1',
        number: 1,
        actOrSequence: '',
        title: 'Opening',
        location: '',
        characters: [],
        whatHappens: '',
        conflict: '',
        turn: '',
        consequence: '',
        whyNext: '',
        linkedSceneIds: [],
        draftNotes: '',
      },
    ]
    const md = outlineToMarkdown({ version: 1, mode: 'beat_sheet_save_the_cat', updatedAt: FIXED_TS, content })
    expect(md).not.toContain('Conflict:')
    expect(md).not.toContain('Turn:')
  })
})

describe('storyBibleToMarkdown', () => {
  it('emits cover and a character section when populated', () => {
    const content = createEmptyStoryBibleContent()
    content.cover.title = 'My Film'
    content.characters.push({
      id: 'c1',
      name: 'Sara',
      role: 'Protagonist',
      want: 'home',
      need: 'forgive',
      flaw: 'guilt',
      secret: '',
      contradiction: '',
      arc: 'guilt -> mercy',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    const md = storyBibleToMarkdown({ version: 1, mode: 'development', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Story Bible — My Film')
    expect(md).toContain('### Sara')
  })
})

describe('treatmentToMarkdown', () => {
  it('returns a header even when empty (so emit is uniform)', () => {
    const content = createEmptyTreatmentContent()
    const md = treatmentToMarkdown({ version: 1, mode: 'three_act_prose', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Treatment')
  })
})

describe('documentsToMarkdown', () => {
  it('returns one Markdown string per surface in stable order', () => {
    const docs = createEmptyDocuments(now)
    const bundle = documentsToMarkdown(docs)
    expect(Object.keys(bundle)).toEqual(['synopsis', 'outline', 'treatment', 'storyBible'])
    for (const md of Object.values(bundle)) {
      expect(typeof md).toBe('string')
    }
  })
})
