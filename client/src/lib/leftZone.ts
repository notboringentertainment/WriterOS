import type { ProjectState } from './projectState'
import { getDisplayProjectTitle } from './projectIdentity'
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
  outline: 'Outline',
  treatment: 'Treatment',
  'story-bible': 'Story Bible',
}

export function surfaceLabel(surface: ActiveTab): string {
  return SURFACE_LABELS[surface]
}

/** A non-blank label or an honest "#N" fallback so nodes are never empty. */
function labelOr(value: string, kind: string, n: number): string {
  const clean = value.trim()
  return clean || `${kind} ${n}`
}

function filledDetail(value: string): string {
  return value.trim() ? 'written' : 'empty'
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
      const units = state.documents.outline.content.units
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
        emptyHint: nodes.length === 0 ? 'No beats yet — build the outline.' : undefined,
      }
    }

    case 'synopsis': {
      const prose = state.documents.synopsis.content.prose
      const sections: Array<[string, string]> = [
        ['Opening', prose.opening],
        ['Escalation', prose.escalation],
        ['Middle', prose.middle],
        ['Climax', prose.climax],
        ['Resolution', prose.resolution],
      ]
      const nodes: StructureNode[] = sections.map(([label, value], i) => ({
        id: `synopsis-${i}`,
        label,
        detail: filledDetail(value),
      }))
      return { surface, heading, nodes, empty: false }
    }

    case 'treatment': {
      const content = state.documents.treatment.content
      const acts: Array<[string, string]> = [
        ['Opening', content.prose.opening],
        ['Act One', content.prose.actOne],
        ['Act Two', content.prose.actTwo],
        ['Act Three', content.prose.actThree],
      ]
      const nodes: StructureNode[] = [
        ...acts.map(([label, value], i) => ({ id: `treatment-act-${i}`, label, detail: filledDetail(value) })),
        ...content.prose.customSections.map((s, i) => ({
          id: s.id,
          label: labelOr(s.heading, 'Section', i + 1),
          detail: filledDetail(s.body),
        })),
        ...content.mainCharacters.map((c, i) => ({
          id: c.id,
          label: labelOr(c.name, 'Character', i + 1),
          detail: c.role.trim() || 'character',
        })),
      ]
      return { surface, heading, nodes, empty: false }
    }

    case 'story-bible': {
      const content = state.documents.storyBible.content
      const sectionNodes: StructureNode[] = [
        { id: 'sb-pitch', label: 'One-Page Pitch' },
        { id: 'sb-tone', label: 'Tone & Style' },
        { id: 'sb-world', label: 'Premise & World' },
        { id: 'sb-engine', label: 'Story Engine' },
      ]
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
  }
}

function surfaceCounts(surface: ActiveTab, state: ProjectState): ConsoleCount[] {
  switch (surface) {
    case 'script':
      return [{ label: 'scenes', value: state.script.scenes.length }]
    case 'outline':
      return [{ label: 'beats', value: state.documents.outline.content.units.length }]
    case 'treatment':
      return [{ label: 'characters', value: state.documents.treatment.content.mainCharacters.length }]
    case 'story-bible':
      return [{ label: 'characters', value: state.documents.storyBible.content.characters.length }]
    case 'synopsis': {
      const p = state.documents.synopsis.content.prose
      const written = [p.opening, p.escalation, p.middle, p.climax, p.resolution].filter(v => v.trim()).length
      return [{ label: 'sections', value: written }]
    }
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
