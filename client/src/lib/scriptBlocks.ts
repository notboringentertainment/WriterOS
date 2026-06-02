import type { ElementType } from './screenplay'
import { normalizeElementType } from './screenplay'

const SCRIPT_FACTS_HASH_PREFIX = 'script-facts:v1'

export interface ScriptBlock {
  index: number
  type: ElementType
  text: string
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function parseScriptBlocks(rawHtml: string): ScriptBlock[] {
  if (!rawHtml.trim() || typeof DOMParser === 'undefined') return []

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>('[data-element-type], p'))

  return elements
    .map((el, sourceIndex) => ({
      index: sourceIndex,
      type: normalizeElementType(el.getAttribute('data-element-type')),
      text: normalizeWhitespace(el.textContent ?? ''),
    }))
    .filter(block => block.text.length > 0)
}

export function hashScriptBlocks(blocks: ReadonlyArray<Pick<ScriptBlock, 'type' | 'text'>>): string {
  const normalizedSequence = blocks.map(block => [block.type, block.text])
  return fnv1a32Hex(`${SCRIPT_FACTS_HASH_PREFIX}:${JSON.stringify(normalizedSequence)}`)
}

export function hashScriptHtml(rawHtml: string): string {
  return hashScriptBlocks(parseScriptBlocks(rawHtml))
}

function fnv1a32Hex(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
