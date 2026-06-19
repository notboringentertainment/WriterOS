import { describe, it, expect } from 'vitest'
import { WorkspaceLocationSchema } from '../../shared/workspaceLocation'

const confirmedSelection = {
  activeSurface: 'script',
  sourceKind: 'selected_text',
  provenance: 'confirmed',
  anchor: { kind: 'block', stableId: 'block:4', label: 'I can still hear the line breathing.' },
  updatedAt: 1,
}

describe('WorkspaceLocationSchema', () => {
  it('accepts a confirmed selection packet', () => {
    expect(WorkspaceLocationSchema.safeParse(confirmedSelection).success).toBe(true)
  })

  it('accepts an inferred active_section packet', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'story-bible',
      sourceKind: 'active_section',
      provenance: 'inferred',
      anchor: { kind: 'section', stableId: 'world', label: 'Premise & World' },
    }).success).toBe(true)
  })

  it('accepts a synthetic first_unanswered packet', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'outline',
      sourceKind: 'first_unanswered',
      provenance: 'synthetic',
      anchor: { kind: 'question', stableId: 'feature.incitingIncident', label: 'The inciting incident' },
    }).success).toBe(true)
  })

  it('accepts a none packet with no anchor', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script',
      sourceKind: 'none',
      provenance: 'none',
    }).success).toBe(true)
  })

  it('rejects confirmed provenance without a concrete focus source', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'outline',
      sourceKind: 'first_unanswered',
      provenance: 'confirmed',
      anchor: { kind: 'question', stableId: 'q1', label: 'x' },
    }).success).toBe(false)
  })

  it('rejects an anchor when sourceKind is none', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script',
      sourceKind: 'none',
      provenance: 'none',
      anchor: { kind: 'block', stableId: 'block:0', label: 'x' },
    }).success).toBe(false)
  })

  it('rejects a missing anchor when sourceKind is not none', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script',
      sourceKind: 'editor_cursor',
      provenance: 'confirmed',
    }).success).toBe(false)
  })

  it('rejects provenance/sourceKind none mismatch', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script',
      sourceKind: 'none',
      provenance: 'synthetic',
    }).success).toBe(false)
  })
})
