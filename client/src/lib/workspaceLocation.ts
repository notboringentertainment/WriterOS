import type { LocationSurface, WorkspaceLocation } from '@shared/workspaceLocation'
import type { SurfaceAwareness } from '@shared/surfaceAwareness'
import { buildScriptIndex, getFocusContext, type ScriptFocusState } from './scriptIndex'
import type { StoryBibleSection } from './shellState'

const STORY_BIBLE_SECTION_LABELS: Record<StoryBibleSection, string> = {
  characters: 'Characters',
  world: 'Premise & World',
  themes: 'Themes',
  tone: 'Tone & Style',
  rules: 'Story Rules',
}

export interface BuildLocationInput {
  activeTab: LocationSurface
  scriptRawHtml: string
  scriptFocus?: ScriptFocusState
  storyBibleSection: StoryBibleSection | null
  surface: SurfaceAwareness
}

function none(activeSurface: LocationSurface): WorkspaceLocation {
  return {
    activeSurface,
    sourceKind: 'none',
    provenance: 'none',
  }
}

export function buildWorkspaceLocation(input: BuildLocationInput): WorkspaceLocation {
  if (input.activeTab === 'script') return buildScriptLocation(input)

  if (input.activeTab === 'story-bible' && input.storyBibleSection) {
    return {
      activeSurface: 'story-bible',
      sourceKind: 'active_section',
      provenance: 'inferred',
      anchor: {
        kind: 'section',
        stableId: input.storyBibleSection,
        label: STORY_BIBLE_SECTION_LABELS[input.storyBibleSection],
      },
    }
  }

  return buildSyntheticLocation(input.activeTab, input.surface)
}

function buildScriptLocation(input: BuildLocationInput): WorkspaceLocation {
  const focus = input.scriptFocus
  const hasSelection = Boolean(focus?.selectedText?.trim())
  const hasCursor = typeof focus?.blockIndex === 'number'
  if (!focus || (!hasSelection && !hasCursor)) return none('script')

  const index = buildScriptIndex(input.scriptRawHtml)
  const context = getFocusContext(index, focus)
  if (!context) return none('script')

  if (hasSelection) {
    return {
      activeSurface: 'script',
      sourceKind: 'selected_text',
      provenance: 'confirmed',
      anchor: {
        kind: 'block',
        stableId: `block:${focus.blockIndex ?? 'sel'}`,
        label: focus.selectedText?.trim().slice(0, 160) ?? '',
      },
      updatedAt: focus.updatedAt,
    }
  }

  return {
    activeSurface: 'script',
    sourceKind: 'editor_cursor',
    provenance: 'confirmed',
    anchor: {
      kind: context.reason === 'current-scene' ? 'scene' : 'block',
      stableId: `block:${focus.blockIndex}`,
      label: context.label || 'the current script position',
    },
    updatedAt: focus.updatedAt,
  }
}

function buildSyntheticLocation(activeSurface: LocationSurface, surface: SurfaceAwareness): WorkspaceLocation {
  if (surface.kind !== 'intake' || !surface.nextQuestion) return none(activeSurface)

  return {
    activeSurface,
    sourceKind: 'first_unanswered',
    provenance: 'synthetic',
    anchor: {
      kind: 'question',
      stableId: surface.nextQuestion.id,
      label: surface.nextQuestion.label,
    },
  }
}
