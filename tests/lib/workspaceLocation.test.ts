import { describe, it, expect } from 'vitest'
import { buildWorkspaceLocation } from '../../client/src/lib/workspaceLocation'
import type { SurfaceAwareness } from '../../shared/surfaceAwareness'

const noneSurface: SurfaceAwareness = { kind: 'none' }

const intakeSurface: SurfaceAwareness = {
  kind: 'intake',
  surface: 'outline',
  surfaceTitle: 'Outline',
  format: 'feature',
  questions: [
    { id: 'feature.openingNormalWorld', label: 'Opening / normal world', helper: 'h', status: 'answered' },
    { id: 'feature.incitingIncident', label: 'The inciting incident', helper: 'h', status: 'unanswered' },
  ],
  nextQuestion: { id: 'feature.incitingIncident', label: 'The inciting incident', helper: 'h', status: 'unanswered' },
  selectionSource: 'first_unanswered',
  answeredCount: 1,
  totalCount: 2,
  nextRecommendedAction: 'answer_next_question',
}

// A minimal screenplay HTML with one scene heading + one action line. Real element types
// exercise the scene-heading path in buildScriptIndex.
const SCRIPT_HTML = '<p data-element-type="scene-heading">INT. DINER - NIGHT</p><p data-element-type="action">Dante slides the file across the table.</p>'

describe('buildWorkspaceLocation', () => {
  it('script with a selection -> confirmed selected_text', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script',
      scriptRawHtml: SCRIPT_HTML,
      scriptFocus: { blockIndex: 1, selectedText: 'slides the file', updatedAt: 5 },
      storyBibleSection: null,
      surface: noneSurface,
    })

    expect(loc.provenance).toBe('confirmed')
    expect(loc.sourceKind).toBe('selected_text')
    expect(loc.anchor?.label).toContain('slides the file')
  })

  it('script with a cursor but no selection -> confirmed editor_cursor', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script',
      scriptRawHtml: SCRIPT_HTML,
      scriptFocus: { blockIndex: 0, updatedAt: 5 },
      storyBibleSection: null,
      surface: noneSurface,
    })

    expect(loc.provenance).toBe('confirmed')
    expect(loc.sourceKind).toBe('editor_cursor')
    expect(loc.anchor?.kind === 'scene' || loc.anchor?.kind === 'block').toBe(true)
  })

  it('script with no focus -> none', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script',
      scriptRawHtml: SCRIPT_HTML,
      scriptFocus: undefined,
      storyBibleSection: null,
      surface: noneSurface,
    })

    expect(loc.sourceKind).toBe('none')
    expect(loc.provenance).toBe('none')
    expect(loc.anchor).toBeUndefined()
  })

  it('story-bible with a last-focused section -> inferred active_section', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'story-bible',
      scriptRawHtml: '',
      scriptFocus: undefined,
      storyBibleSection: 'world',
      surface: noneSurface,
    })

    expect(loc.provenance).toBe('inferred')
    expect(loc.sourceKind).toBe('active_section')
    expect(loc.anchor).toEqual({ kind: 'section', stableId: 'world', label: 'Premise & World' })
  })

  it('outline -> synthetic first_unanswered pointing at the same prompt.id', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'outline',
      scriptRawHtml: '',
      scriptFocus: undefined,
      storyBibleSection: null,
      surface: intakeSurface,
    })

    expect(loc.provenance).toBe('synthetic')
    expect(loc.sourceKind).toBe('first_unanswered')
    expect(loc.anchor?.stableId).toBe('feature.incitingIncident')
    expect(loc.anchor?.label).toBe('The inciting incident')
  })

  it('story-bible with no section but an intake surface -> synthetic first_unanswered', () => {
    const sb: SurfaceAwareness = { ...intakeSurface, surface: 'story-bible', surfaceTitle: 'Story Bible' }
    const loc = buildWorkspaceLocation({
      activeTab: 'story-bible',
      scriptRawHtml: '',
      scriptFocus: undefined,
      storyBibleSection: null,
      surface: sb,
    })

    expect(loc.sourceKind).toBe('first_unanswered')
    expect(loc.provenance).toBe('synthetic')
  })
})
