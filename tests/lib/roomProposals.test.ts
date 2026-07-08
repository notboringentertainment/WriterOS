import { describe, expect, it } from 'vitest'
import { applyProposalToStoryBible, canApplyProposal, renderStoryLocksBlock } from '../../client/src/lib/roomProposals'
import { createEmptyStoryBibleContent } from '@shared/documents'

const baseContent = () => {
  const content = createEmptyStoryBibleContent()
  content.characters = [
    {
      id: 'r1',
      name: 'Rosa',
      role: 'lead',
      want: 'win the contest',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    },
  ]
  return content
}

describe('canApplyProposal', () => {
  it('accepts story bible character psychology paths', () => {
    expect(canApplyProposal('storyBible', 'characters[r1].want')).toBe(true)
    expect(canApplyProposal('storyBible', 'characters[r1].contradiction')).toBe(true)
  })

  it('rejects other surfaces, unknown fields, and non-character paths', () => {
    expect(canApplyProposal('outline', 'characters[r1].want')).toBe(false)
    expect(canApplyProposal('storyBible', 'characters[r1].name')).toBe(false)
    expect(canApplyProposal('storyBible', 'onePagePitch.logline')).toBe(false)
  })
})

describe('applyProposalToStoryBible', () => {
  it('applies a want change immutably', () => {
    const content = baseContent()
    const next = applyProposalToStoryBible(content, 'characters[r1].want', 'win back the restaurant')
    expect(next).not.toBeNull()
    expect(next!.characters[0].want).toBe('win back the restaurant')
    expect(content.characters[0].want).toBe('win the contest') // original untouched
  })

  it('returns null for unknown characters or unsupported fields', () => {
    const content = baseContent()
    expect(applyProposalToStoryBible(content, 'characters[nope].want', 'x')).toBeNull()
    expect(applyProposalToStoryBible(content, 'characters[r1].id', 'x')).toBeNull()
  })
})

describe('renderStoryLocksBlock', () => {
  it('renders only active locks, one per line', () => {
    const content = baseContent()
    content.locks = [
      { id: 'l1', statement: 'Rosa sells the restaurant at the end.', scope: 'ending', rationale: '', source: 'writer', status: 'active', createdAt: '' },
      { id: 'l2', statement: 'Retired lock.', scope: 'story', rationale: '', source: 'writer', status: 'retired', createdAt: '' },
    ]
    expect(renderStoryLocksBlock(content)).toBe('[ending] Rosa sells the restaurant at the end.')
  })

  it('returns empty string with no active locks', () => {
    expect(renderStoryLocksBlock(baseContent())).toBe('')
  })
})
