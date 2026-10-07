// tests/server/morganHost/proposals.test.ts
import { describe, expect, it } from 'vitest'
import { validateProposal } from '../../../server/morganHost/proposals'
import { createEmptyOutlineContent } from '../../../shared/documents' // or the empty-content helper each schema's tests use

describe('validateProposal', () => {
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

