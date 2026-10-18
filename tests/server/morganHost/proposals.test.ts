// tests/server/morganHost/proposals.test.ts
import { describe, expect, it } from 'vitest'
import { SYNCED_BEATS_PROBLEM, validateProposal } from '../../../server/morganHost/proposals'
import { createEmptyOutlineContent } from '../../../shared/documents' // or the empty-content helper each schema's tests use

describe('validateProposal', () => {
  it('accepts prose pages and refuses retired structured targets', () => {
    expect(validateProposal({ surface: 'page', page: 'bible', baseRevision: 0, markdown: 'A courier chooses to stay.', summary: 'Write the synopsis' })).toBeNull()
    expect(validateProposal({ surface: 'page', page: 'unknown', baseRevision: 0, markdown: '', summary: 'Write' } as never)).toMatch(/page/)
    expect(validateProposal({ surface: 'page', page: 'outline', baseRevision: -1, markdown: '', summary: 'Write' })).toMatch(/baseRevision/)
    for (const surface of ['synopsis', 'treatment']) {
      expect(validateProposal({ surface, baseRevision: 0, content: {}, summary: 'Write' } as never)).toBe('This page is now written by Morgan')
    }
  })
  it('accepts a script append and a replace-scene', () => {
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' })).toBeNull()
    expect(validateProposal({ surface: 'script', target: { kind: 'replace-scene', sceneHeading: 'INT. KITCHEN - NIGHT', expectedScene: [{ type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' }, { type: 'action', text: 'Dishes.' }] }, blocks: [{ type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' }], summary: 'Rewrite' })).toBeNull()
  })

  it('names the first problem plainly', () => {
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'montage', text: 'x' } as never], summary: 's' })).toMatch(/^blocks\.0\.type/)
    expect(validateProposal({ surface: 'script', target: { kind: 'replace-scene' } as never, blocks: [{ type: 'action', text: 'x' }], summary: 's' })).toMatch(/^target/)
    expect(validateProposal({ surface: 'lookbook' as never, baseRevision: 1, content: {}, summary: 's' })).toMatch(/cannot be changed/)
    expect(validateProposal({ surface: 'outline', baseRevision: 3, content: { nonsense: true }, summary: 's' })).toMatch(/^content/)
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'x' }], summary: ' ' })).toMatch(/^summary/)
  })

  it('accepts structured content that matches its schema', () => {
    // Build a valid outline content with the helper the existing document tests use (see tests/shared/documents*.test.ts).
    const content = createEmptyOutlineContent()
    expect(validateProposal({ surface: 'outline', baseRevision: 3, content, summary: 'Tighten act two' })).toBeNull()
  })
})


describe('validateProposal on an Outline synced from a beat sheet', () => {
  const unit = (whatHappens: string) => ({
    id: 'u1', number: 1, actOrSequence: '', title: 'The aftermath', location: '', characters: [], whatHappens,
    conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '',
  })
  const synced = (whatHappens: string) => ({
    ...createEmptyOutlineContent(),
    units: [unit(whatHappens)],
    beatSheetSource: { ticket: 'resolved/28-beat-sheet.md', sourceHash: 'h', syncedAt: '2026-10-06T00:00:00.000Z', beatCount: 1, label: null },
  })

  it('refuses a change to the beats and says to change the beat sheet', () => {
    const problem = validateProposal({ surface: 'outline', baseRevision: 4, content: synced('The parlor floor.'), summary: 'parlor' }, { outline: synced('The living room floor.') })
    expect(problem).toBe(SYNCED_BEATS_PROBLEM)
    expect(problem).toMatch(/beat sheet/)
  })

  it('allows changes elsewhere in a synced Outline', () => {
    const current = synced('The living room floor.')
    const proposed = { ...current, spine: { ...current.spine, protagonist: 'The crew chief' } }
    expect(validateProposal({ surface: 'outline', baseRevision: 4, content: proposed, summary: 'premise' }, { outline: current })).toBeNull()
  })

  it('allows beat changes when the Outline is not synced, or the current page is unknown', () => {
    const { beatSheetSource: _unused, ...unsynced } = synced('The living room floor.')
    const proposed = synced('The parlor floor.')
    expect(validateProposal({ surface: 'outline', baseRevision: 4, content: { ...proposed, beatSheetSource: undefined }, summary: 's' }, { outline: unsynced })).toBeNull()
    expect(validateProposal({ surface: 'outline', baseRevision: 4, content: proposed, summary: 's' })).toBeNull()
  })
})
