import type { ScriptBlock } from './scriptBlocks'
import { hashScriptBlocks, parseScriptBlocks } from './scriptBlocks'

export type ScriptFactSection = 'characters' | 'locations' | 'times' | 'transitions'
export type NearMatchFactSection = 'characters' | 'locations'
export type ScriptFactWarningReason = 'edit-distance' | 'token-containment'

export interface ScriptFactEntry {
  label: string
  count: number
  blockIndices: number[]
}

export interface ScriptFactWarning {
  kind: 'near-match'
  section: NearMatchFactSection
  labels: [string, string]
  reason: ScriptFactWarningReason
}

export interface DerivedScriptFacts {
  contentHash: string
  characters: ScriptFactEntry[]
  locations: ScriptFactEntry[]
  times: ScriptFactEntry[]
  transitions: ScriptFactEntry[]
  warnings: ScriptFactWarning[]
}

const SCENE_TIME_LABELS = new Set([
  'AFTERNOON',
  'CONTINUOUS',
  'DAWN',
  'DAY',
  'DUSK',
  'EVENING',
  'LATER',
  'MIDDAY',
  'MIDNIGHT',
  'MOMENTS LATER',
  'MORNING',
  'NIGHT',
  'NOON',
  'PRE-LAP',
  'SAME',
  'SAME TIME',
  'SUNRISE',
  'SUNSET',
])

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeAsciiLabel(value: string): string {
  return normalizeWhitespace(
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
  )
}

function stripCharacterCueDecorations(value: string): string {
  let normalized = normalizeWhitespace(value)
  let previous = ''
  while (normalized !== previous) {
    previous = normalized
    normalized = normalized.replace(
      /\s*\((?:CONT['’]?D|CONTINUED|O\.S\.|O\.C\.|V\.O\.|VOICE OVER|OFFSCREEN|PRE-LAP|ON PHONE|FILTERED)\)\s*$/i,
      ''
    ).trim()
  }
  return normalized
}

function normalizeCharacterCue(value: string): string {
  return normalizeAsciiLabel(stripCharacterCueDecorations(value))
}

function normalizeFactKey(value: string): string {
  return normalizeAsciiLabel(value)
}

function addFact(
  facts: Map<string, ScriptFactEntry>,
  label: string,
  blockIndex: number,
  keyLabel = label,
): void {
  const normalizedLabel = normalizeWhitespace(label)
  if (!normalizedLabel) return

  const key = normalizeFactKey(keyLabel)
  if (!key) return

  const existing = facts.get(key)
  if (existing) {
    existing.count += 1
    existing.blockIndices.push(blockIndex)
    return
  }

  facts.set(key, {
    label: normalizedLabel,
    count: 1,
    blockIndices: [blockIndex],
  })
}

function compareFactLabels(a: ScriptFactEntry, b: ScriptFactEntry): number {
  return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
}

function orderedFacts(facts: Map<string, ScriptFactEntry>): ScriptFactEntry[] {
  return Array.from(facts.values()).sort((a, b) => (
    b.count - a.count ||
    compareFactLabels(a, b) ||
    a.blockIndices[0] - b.blockIndices[0]
  ))
}

function extractSceneTimes(sceneHeading: string): string[] {
  const normalizedHeading = normalizeWhitespace(sceneHeading)
  if (!normalizedHeading) return []

  const segments = normalizedHeading
    .split(/\s*(?:--|[–—])\s*|\s+-\s+/)
    .map(segment => normalizeAsciiLabel(segment))
    .filter(Boolean)
  const candidates = segments.length > 1 ? segments.slice(1) : segments
  return candidates.filter(segment => SCENE_TIME_LABELS.has(segment))
}

function normalizedTokens(value: string): string[] {
  return normalizeAsciiLabel(value).split(' ').filter(Boolean)
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[b.length]
}

function tokenContainmentNearMatch(a: string, b: string): boolean {
  const aTokens = normalizedTokens(a)
  const bTokens = normalizedTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false

  const [shorter, longer] = aTokens.length <= bTokens.length
    ? [aTokens, bTokens]
    : [bTokens, aTokens]
  if (longer.length !== shorter.length + 1) return false

  const longerSet = new Set(longer)
  return shorter.every(token => longerSet.has(token))
}

function nearMatchReason(
  section: NearMatchFactSection,
  a: string,
  b: string,
): ScriptFactWarningReason | null {
  const normalizedA = normalizeAsciiLabel(a)
  const normalizedB = normalizeAsciiLabel(b)
  if (!normalizedA || !normalizedB || normalizedA === normalizedB) return null

  const longerLength = Math.max(normalizedA.length, normalizedB.length)
  if (longerLength >= 5 && levenshteinDistance(normalizedA, normalizedB) <= 2) {
    return 'edit-distance'
  }

  if (section === 'locations' && tokenContainmentNearMatch(a, b)) {
    return 'token-containment'
  }

  return null
}

function nearMatchWarnings(
  section: NearMatchFactSection,
  entries: ScriptFactEntry[],
): ScriptFactWarning[] {
  const warnings: ScriptFactWarning[] = []

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const reason = nearMatchReason(section, entries[i].label, entries[j].label)
      if (!reason) continue

      warnings.push({
        kind: 'near-match',
        section,
        labels: [entries[i].label, entries[j].label],
        reason,
      })
    }
  }

  return warnings
}

export function deriveScriptFactsFromBlocks(blocks: readonly ScriptBlock[]): DerivedScriptFacts {
  const characters = new Map<string, ScriptFactEntry>()
  const locations = new Map<string, ScriptFactEntry>()
  const times = new Map<string, ScriptFactEntry>()
  const transitions = new Map<string, ScriptFactEntry>()

  blocks.forEach((block) => {
    if (block.type === 'character') {
      addFact(
        characters,
        stripCharacterCueDecorations(block.text),
        block.index,
        normalizeCharacterCue(block.text),
      )
      return
    }

    if (block.type === 'scene-heading') {
      addFact(locations, block.text, block.index)
      extractSceneTimes(block.text).forEach(time => addFact(times, time, block.index))
      return
    }

    if (block.type === 'transition') {
      addFact(transitions, block.text, block.index)
    }
  })

  const characterFacts = orderedFacts(characters)
  const locationFacts = orderedFacts(locations)

  return {
    contentHash: hashScriptBlocks(blocks),
    characters: characterFacts,
    locations: locationFacts,
    times: orderedFacts(times),
    transitions: orderedFacts(transitions),
    warnings: [
      ...nearMatchWarnings('characters', characterFacts),
      ...nearMatchWarnings('locations', locationFacts),
    ],
  }
}

export function deriveScriptFactsFromHtml(rawHtml: string): DerivedScriptFacts {
  return deriveScriptFactsFromBlocks(parseScriptBlocks(rawHtml))
}
