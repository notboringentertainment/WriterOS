import type { ElementType } from './screenplay'
import { normalizeElementType } from './screenplay'
import {
  extractSceneTimes,
  normalizeCharacterCue,
  normalizeFactKey,
  type ScriptFactSection,
} from './scriptFacts'

export interface LiveScriptBlock {
  type: ElementType
  text: string
  pos: number
}

export interface FactNavigationTarget {
  section: ScriptFactSection
  label: string
}

// Structural subset of a ProseMirror node/doc — keeps this module editor-agnostic
// and unit-testable without instantiating TipTap.
interface NodeLike {
  type: { name: string }
  attrs: { elementType?: unknown }
  textContent: string
}

export interface DocLike {
  forEach(callback: (node: NodeLike, offset: number) => void): void
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// Walk the live document in document order, capturing each non-empty paragraph
// with its live ProseMirror position. Empty paragraphs are filtered exactly as
// parseScriptBlocks filters them, so positions stay aligned with derivation.
export function liveScriptBlocksFromDoc(doc: DocLike): LiveScriptBlock[] {
  const blocks: LiveScriptBlock[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    const text = normalizeWhitespace(node.textContent ?? '')
    if (!text) return
    blocks.push({
      type: normalizeElementType(node.attrs.elementType),
      text,
      pos: offset,
    })
  })
  return blocks
}

function matchesTarget(block: LiveScriptBlock, target: FactNavigationTarget): boolean {
  switch (target.section) {
    case 'characters':
      return (
        block.type === 'character' &&
        normalizeCharacterCue(block.text) === normalizeCharacterCue(target.label)
      )
    case 'locations':
      return block.type === 'scene-heading' && normalizeFactKey(block.text) === normalizeFactKey(target.label)
    case 'transitions':
      return block.type === 'transition' && normalizeFactKey(block.text) === normalizeFactKey(target.label)
    case 'times':
      return (
        block.type === 'scene-heading' &&
        extractSceneTimes(block.text).some(time => normalizeFactKey(time) === normalizeFactKey(target.label))
      )
    default:
      return false
  }
}

// Resolve a fact target to ordered live positions. Reads only `blocks`
// (built from the live document) — never cached blockIndices.
export function resolveFactOccurrences(
  blocks: readonly LiveScriptBlock[],
  target: FactNavigationTarget,
): number[] {
  if (!normalizeFactKey(target.label)) return []
  const positions: number[] = []
  for (const block of blocks) {
    if (matchesTarget(block, target)) positions.push(block.pos)
  }
  return positions
}
