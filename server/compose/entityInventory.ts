import type { FactSheet } from '../../shared/compose/types'

export interface EntityInventory { names: Set<string>; numbers: Set<string> }

const SINGLE_TOKEN_STOPWORDS = new Set([
  'A',
  'An',
  'And',
  'Are',
  'As',
  'At',
  'But',
  'By',
  'For',
  'From',
  'He',
  'Her',
  'His',
  'If',
  'In',
  'Into',
  'Is',
  'It',
  'No',
  'Not',
  'Of',
  'On',
  'Or',
  'Our',
  'She',
  'So',
  'The',
  'Their',
  'Then',
  'There',
  'They',
  'This',
  'To',
  'We',
  'When',
  'Where',
  'Who',
  'Why',
  'With',
  'You',
  'Your',
])

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
}

export function buildEntityInventory(fs: FactSheet): EntityInventory {
  const names = new Set<string>()
  const numbers = new Set<string>()
  for (const f of fs.fields) {
    const text = f.value
    for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)) names.add(m[1])
    for (const m of text.matchAll(/\b[A-Z][a-z]+\b/g)) {
      if (!SINGLE_TOKEN_STOPWORDS.has(m[0])) names.add(m[0])
    }
    for (const m of text.matchAll(/\b\d[\d,.:]*\b/g)) numbers.add(m[0])
  }
  return { names, numbers }
}

export function traceEntity(candidate: string, inv: EntityInventory): boolean {
  const n = norm(candidate)
  if (!n) return true
  for (const name of inv.names) {
    const nn = norm(name)
    if (nn === n) return true
    if (n.includes(' ') && nn.includes(' ') && (nn.includes(n) || n.includes(nn))) return true
  }
  return false
}

export function traceNumber(candidate: string, inv: EntityInventory): boolean {
  const n = candidate.replace(/[,\.:\s]/g, '')
  for (const num of inv.numbers) if (num.replace(/[,\.:\s]/g, '') === n) return true
  return false
}
