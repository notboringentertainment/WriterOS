import type { ProjectState } from './projectState'
import { getDisplayProjectTitle } from './projectIdentity'
import { visibleOutlineUnits } from './outlineDeck'
import { STORY_BIBLE_SECTIONS } from './storyBibleSections'
import {
  type ActiveTab,
  getDefaultPersona,
  formatWritingPartnerSpeaker,
} from './wpRouting'

/**
 * Left-zone view-model selectors for the three-zone shell (Slice 3).
 *
 * Pure functions only — they read project/shell state and return plain data for the
 * Structure Spine and Context Console slots. No DOM, no project-specific hardcoding;
 * the Spine renders ONLY the currently active surface's structure, generic over activeTab.
 */

export interface StructureNode {
  id: string
  label: string
  /** Optional secondary text (act/sequence, role, filled/empty). */
  detail?: string
}

export interface SurfaceStructure {
  surface: ActiveTab
  heading: string
  nodes: StructureNode[]
  empty: boolean
  emptyHint?: string
}

export interface ConsoleCount {
  label: string
  value: number
}

export interface ConsoleState {
  title: string
  surface: ActiveTab
  surfaceLabel: string
  /** Active host/specialist, display-aliased — e.g. "Morgan" or "Morgan (@Oliver)". */
  persona: string
  counts: ConsoleCount[]
}

const SURFACE_LABELS: Record<ActiveTab, string> = {
  script: 'Script',
  synopsis: 'Synopsis',
  outline: 'Beat Sheet',
  treatment: 'Treatment',
  'story-bible': 'Story Facts',
  'whats-standing': "What's Standing",
}

export function surfaceLabel(surface: ActiveTab): string {
  return SURFACE_LABELS[surface]
}

/** A non-blank label or an honest "#N" fallback so nodes are never empty. */
function labelOr(value: string, kind: string, n: number): string {
  const clean = value.trim()
  return clean || `${kind} ${n}`
}

/** The Beat Sheet shows Story-drive's beats only; an unlinked project has none. */
function storyDriveBeats(state: ProjectState) {
  const content = state.documents.outline.content
  return content.beatSheetSource ? visibleOutlineUnits(content, state.meta.format) : []
}

function pageHeadings(state: ProjectState, page: 'synopsis' | 'treatment'): string[] {
  return (state.pages[page]?.markdown ?? '').split('\n')
    .map(line => /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1]?.trim() ?? '')
    .filter(Boolean)
}

export function selectSurfaceStructure(surface: ActiveTab, state: ProjectState): SurfaceStructure {
  const heading = surfaceLabel(surface)

  switch (surface) {
    case 'script': {
      const nodes: StructureNode[] = state.script.scenes.map((scene, i) => ({
        id: scene.id,
        label: labelOr(scene.heading, 'Scene', i + 1),
      }))
      return {
        surface,
        heading,
        nodes,
        empty: nodes.length === 0,
        emptyHint: nodes.length === 0 ? 'No scenes yet — import or write a script.' : undefined,
      }
    }

    case 'outline': {
      const units = storyDriveBeats(state)
      const nodes: StructureNode[] = units.map(u => ({
        id: u.id,
        label: labelOr(u.title, 'Beat', u.number),
        detail: u.actOrSequence.trim() || undefined,
      }))
      return {
        surface,
        heading,
        nodes,
        empty: nodes.length === 0,
        emptyHint: nodes.length === 0 ? 'No beats yet.' : undefined,
      }
    }

    case 'synopsis':
    case 'treatment': {
      // The prose page's own headings; the frozen legacy sections are no longer shown.
      const nodes: StructureNode[] = pageHeadings(state, surface).map((label, i) => ({ id: `${surface}-${i}`, label }))
      return {
        surface,
        heading,
        nodes,
        empty: nodes.length === 0,
        emptyHint: nodes.length === 0 ? `No ${heading.toLowerCase()} written yet.` : undefined,
      }
    }

    case 'story-bible': {
      const content = state.documents.storyBible.content
      const sectionNodes: StructureNode[] = STORY_BIBLE_SECTIONS
        .filter(section => !section.special)
        .map(section => ({ id: `sb-${section.id}`, label: section.title }))
      const characterNodes: StructureNode[] = content.characters.map((c, i) => ({
        id: c.id,
        label: labelOr(c.name, 'Character', i + 1),
        detail: c.role.trim() || 'character',
      }))
      const mapNodes: StructureNode[] = content.episodeOrSequenceMap.map((m, i) => ({
        id: m.id,
        label: labelOr(m.title, 'Unit', i + 1),
        detail: m.unit.trim() || undefined,
      }))
      return { surface, heading, nodes: [...sectionNodes, ...characterNodes, ...mapNodes], empty: false }
    }

    case 'whats-standing':
      // Report surfaces have no document structure
      return { surface, heading, nodes: [], empty: true }
  }
}

function surfaceCounts(surface: ActiveTab, state: ProjectState): ConsoleCount[] {
  switch (surface) {
    case 'script':
      return [{ label: 'scenes', value: state.script.scenes.length }]
    case 'outline':
      return [{ label: 'beats', value: storyDriveBeats(state).length }]
    case 'treatment':
      return [{ label: 'sections', value: pageHeadings(state, surface).length }]
    case 'story-bible':
      return [{ label: 'characters', value: state.documents.storyBible.content.characters.length }]
    case 'synopsis':
      return [{ label: 'sections', value: pageHeadings(state, surface).length }]
    case 'whats-standing':
      // Report surfaces have no document counts
      return []
  }
}

export function selectConsoleState(
  state: ProjectState,
  surface: ActiveTab,
  storyBibleSection: string | null,
): ConsoleState {
  const personaId = getDefaultPersona(surface, storyBibleSection, '')
  return {
    title: getDisplayProjectTitle(state.meta.title),
    surface,
    surfaceLabel: surfaceLabel(surface),
    persona: formatWritingPartnerSpeaker(personaId),
    counts: surfaceCounts(surface, state),
  }
}
